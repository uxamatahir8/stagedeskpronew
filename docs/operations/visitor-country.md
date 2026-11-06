# Visitor country at the StageDesk edge

The website chooses an initial language and display currency from a country
header supplied by the trusted edge. The country is for display only. Never
use it for tax, billing, authorization, or other security decisions.

## Current server state (verified 2026-11-06)

Staging and production resolve to the same host (`srv1092557`) and share the
same Nginx service. Production behavior was not changed during this work.

| Item | Verified state |
|---|---|
| Operating system | Ubuntu 24.04.4 LTS (Noble), Linux 6.8 |
| Nginx | Control Web Panel build `nginx/1.30.3` |
| Public topology | Clients connect directly to Nginx; no Cloudflare or other trusted HTTP proxy is in front |
| Staging upstream | `127.0.0.1:3100` (Next.js under PM2) |
| Production upstream | `127.0.0.1:8080` (the existing PHP application) |
| Staging vhost | `/etc/nginx/sites-enabled/staging.stagedeskpro.com.conf` |
| Production vhost | `/etc/nginx/sites-enabled/www.stagedeskpro.com.conf` |
| Agency/wildcard vhost | `/etc/nginx/sites-enabled/stagedeskpro-sites.conf` |
| Main configuration | `/etc/nginx/nginx.conf` |
| Active country header | None; staging strips all five application country headers and uses the browser-language fallback |

The main configuration loads the legacy `ngx_http_geoip_module` and reads
`/etc/nginx/geoip/GeoIP.dat`. That database is old and must not be used for
StageDesk localization. A live 2026-11-06 regional test classified a current
Netherlands probe as unknown and a London probe as France. The test endpoint
was removed and the original staging vhost restored.

The application therefore still falls back to `Accept-Language` until the
GeoIP2 blockers below are resolved. A visitor in the Netherlands with an
`en-GB` browser can consequently receive English and GBP.

The staging `location /` currently sets `X-Country-Code`, `CF-IPCountry`,
`X-Vercel-IP-Country`, `CloudFront-Viewer-Country`, and `X-Geo-Country` to an
empty value. This prevents a client from spoofing display localization while
there is no trustworthy server-detected country. The pre-hardening vhost is
backed up at
`/etc/nginx/sites-enabled/staging.stagedeskpro.com.conf.before-country-strip-20261106T153718Z`.

## Prepared GeoIP2 update mechanism

The following Ubuntu packages were installed from the Noble repositories:

- `geoipupdate` 6.1.0-1ubuntu0.3
- `mmdb-bin` 1.9.1-1build1
- `geoip-bin` 1.6.12-11.1build1 (legacy database diagnostics only)

`/etc/GeoIP.conf` is owned by `root:root`, mode `0600`, and requests only
`GeoLite2-Country`. It still contains the package's credential placeholders.
Do not put credentials in this repository, a ticket, a shell command, or an
application environment file.

The package-default updater configuration is backed up at
`/etc/GeoIP.conf.before-stagedesk-20261106T151908Z`.

The packaged `geoipupdate.timer` is enabled and persistent. It runs on
Wednesday and Saturday in the `America/New_York` calendar with up to three
hours of randomized delay. Its service writes only under `/var/lib/GeoIP/`,
logs failures to the system journal, and skips cleanly while `AccountID` is not
configured. Once valid credentials are present, the expected database is:

```text
/var/lib/GeoIP/GeoLite2-Country.mmdb
```

Check the update mechanism with:

```bash
systemctl status geoipupdate.timer
systemctl list-timers geoipupdate.timer
journalctl -u geoipupdate.service --since '30 days ago'
stat /etc/GeoIP.conf /var/lib/GeoIP/GeoLite2-Country.mmdb
mmdblookup --file /var/lib/GeoIP/GeoLite2-Country.mmdb --ip 8.8.8.8 country iso_code
```

### Supplying MaxMind credentials

An operator with root access must obtain a GeoLite2 license key from the
organization's MaxMind account. In an interactive root session, edit
`/etc/GeoIP.conf`, set `AccountID` and `LicenseKey`, retain
`EditionIDs GeoLite2-Country`, and confirm mode `0600`. Do not send the key in
chat or pass it on a command line. Then run:

```bash
geoipupdate -v
stat -c '%n %U:%G %a %s %y' /var/lib/GeoIP/GeoLite2-Country.mmdb
systemctl start geoipupdate.service
journalctl -u geoipupdate.service -n 50 --no-pager
```

`geoipupdate` downloads to a temporary file and replaces a completed database;
Nginx continues serving requests during an update. Reload Nginx after a
successful database replacement so workers reopen the current file.

## GeoIP2 module blocker

Ubuntu's `libnginx-mod-http-geoip2` package cannot be installed on this host:
it requires `nginx-abi-1.24.0-1`, while Control Web Panel supplies Nginx 1.30.
APT correctly refuses the incompatible combination. Do not downgrade or
replace Nginx on this shared production host to satisfy that dependency.

Before deployment, build or obtain `ngx_http_geoip2_module` for the exact CWP
Nginx version and validate it in a maintenance window against every enabled
vhost. An Nginx upgrade requires rebuilding the external module. Do not load
the module until the `.mmdb` exists and `nginx -t` succeeds.

## Required staging configuration after the blockers are resolved

Load the compatible module from `/etc/nginx/modules-enabled/`, then define the
database in the `http` context (prefer a dedicated file under
`/etc/nginx/conf.d/`):

```nginx
geoip2 /var/lib/GeoIP/GeoLite2-Country.mmdb {
  auto_reload 1h;
  $stagedesk_country_code country iso_code;
}
```

Staging is reached directly, so `$remote_addr` is the client address. Do not
enable `real_ip_header X-Forwarded-For` or trust the existing dormant
`set_real_ip_from 0.0.0.0/0`; arbitrary clients could spoof their address. If a
CDN is added later, trust only its published source ranges and test IPv4 and
IPv6 before enabling its real-IP header.

In the `location /` block that proxies staging to port 3100, place these next
to the existing `proxy_set_header` directives. Nginx header directives are
inherited as a set, so putting them in a different parent block is unsafe.

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

proxy_set_header X-Country-Code $stagedesk_country_code;
proxy_set_header CF-IPCountry "";
proxy_set_header X-Vercel-IP-Country "";
proxy_set_header CloudFront-Viewer-Country "";
proxy_set_header X-Geo-Country "";
```

This overwrites the only trusted application header and removes every
higher-priority country header understood by the app. It preserves Host,
forwarding, uploads, authentication, and existing proxy behavior. Apply it to
the exact staging vhost first; do not add it to production or wildcard vhosts
without separate authorization.

## Deployment and verification

Before editing, record the effective configuration and make a timestamped
copy of every file being changed:

```bash
nginx -T > /root/nginx-T.before-visitor-country.txt 2>&1
cp -a /etc/nginx/sites-enabled/staging.stagedeskpro.com.conf \
  /etc/nginx/sites-enabled/staging.stagedeskpro.com.conf.before-visitor-country
nginx -t
systemctl reload nginx
systemctl is-active nginx
```

Use an opaque, exact-match diagnostic location only for the brief regional
test. Return only the GeoIP2 country variable, never the client IP, headers, or
internal addresses. Test with real probes or VPN exits in the Netherlands,
United Kingdom, and United States, then remove the location and reload Nginx.
A manually supplied `CF-IPCountry` is not regional evidence.

Required results:

| Probe | Edge country | Fresh app behavior after branch deployment |
|---|---|---|
| Netherlands, browser `en-GB` | `NL` | Dutch, EUR |
| United Kingdom | `GB` | English, GBP |
| United States | `US` | English, USD |
| An address absent from the database | empty | Browser-language fallback |

Also send fake values in all five application country headers. The diagnostic
must still report the probe's real country, and an upstream capture must show
only the server-generated `X-Country-Code`.

After infrastructure validation, deploy the localization branch through the
normal staging CI/CD flow. In a fresh desktop and mobile browser from an NL
exit, verify `/`, `/pricing`, navigation, manual English/GBP persistence, and
returning both selectors to Automatic. Starting checkout after choosing a
display currency must still show the EUR subscription amount.

## Troubleshooting

- Empty country: check database existence/permissions, module load errors,
  IPv6 coverage, and `journalctl -u geoipupdate.service`.
- Every visitor has the server's country: an internal proxy address is being
  looked up. Correct real-IP handling, but trust only the actual proxy ranges.
- A fake header wins: inspect `nginx -T` and ensure all five header directives
  are in the effective staging `location /` block.
- Wrong country: inspect the database build date and reproduce with a real
  regional probe. Do not fall back to the legacy `.dat` database.
- Nginx refuses the module: compare `nginx -V` and the module's build version;
  rebuild for the exact installed Nginx package.
- Nginx config is valid but the app stays English/GBP: confirm the localization
  branch is deployed and `X-Country-Code` reaches the Next.js upstream.

## Rollback

Restore the timestamped staging vhost, run `nginx -t`, and gracefully reload:

```bash
cp -a /etc/nginx/sites-enabled/staging.stagedeskpro.com.conf.before-visitor-country \
  /etc/nginx/sites-enabled/staging.stagedeskpro.com.conf
nginx -t && systemctl reload nginx
```

For the currently active header-stripping change, the exact rollback source is
`/etc/nginx/sites-enabled/staging.stagedeskpro.com.conf.before-country-strip-20261106T153718Z`.

If GeoIP2 was loaded globally, restore the backed-up module/config files only
after checking that all vhosts still validate. The prepared updater can be
disabled independently with `systemctl disable --now geoipupdate.timer`; this
does not change request handling.

## Production requirements

Production currently receives no trusted country header. It shares the Nginx
instance but uses a separate vhost and application. After staging passes real
regional, spoofing, mobile, and billing checks, production needs a separately
authorized change, fresh backups, `nginx -t`, and a graceful reload. Confirm
custom domains, wildcard sites, authentication, uploads, webhooks, and TLS
before and after that change.
