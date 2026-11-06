# Visitor country: what the server must provide

The website picks a first language and display currency from the visitor's country. **The app can't work out the country itself.** It reads it from a header set by whatever sits in front of it. Without that header, it falls back to the browser's language list, so a visitor in the Netherlands with an `en-GB` browser gets English and GBP.

The country only chooses what to display. Plans are billed in euros and bookings in their own currency, whatever the country says. Never use it for tax, billing or access: a client can send these headers itself unless the edge overwrites them.

## Headers the app reads

First usable one wins (`visitorCountry` in `packages/core/src/visitor.ts`). Values are ISO 3166 alpha-2 codes. `XX` and `T1` count as unknown.

| Header | Set by |
|---|---|
| `CF-IPCountry` | Cloudflare proxy (orange cloud) |
| `X-Vercel-IP-Country` | Vercel |
| `CloudFront-Viewer-Country` | CloudFront (enable it in the origin request policy) |
| `X-Country-Code`, `X-Geo-Country` | Your own reverse proxy |

## Staging and production: pick one option

Staging's nginx is reached directly, with no CDN in front of it, so none of these headers is set today. Both options are free.

### Option A: Cloudflare proxy

1. Put the domain on Cloudflare and proxy the DNS record.
2. Turn on **Network → IP Geolocation**, if it's off.
3. Check that nginx passes the header on. It does unless it was told to drop it.
4. Allow only [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) to reach the origin on ports 80 and 443, so visitors can't bypass it.
5. Leave HTML uncached (Cloudflare's default). A "Cache Everything" rule would mix visitors' languages up.

Agency subdomains and custom domains also go through nginx, so check that wildcard TLS and on-demand certificates still work behind Cloudflare before moving those hosts.

### Option B: nginx with a local GeoIP database

Needs `libnginx-mod-http-geoip2` and a free GeoLite2 Country database (free MaxMind account, updated with `geoipupdate`).

```nginx
# http { } block
geoip2 /var/lib/GeoIP/GeoLite2-Country.mmdb {
  $geoip2_country_code country iso_code;
}

# In the location that proxies to the app. proxy_set_header replaces what the
# client sent; the empty values stop forged headers from reaching the app.
proxy_set_header X-Country-Code $geoip2_country_code;
proxy_set_header CF-IPCountry "";
proxy_set_header X-Vercel-IP-Country "";
proxy_set_header CloudFront-Viewer-Country "";
```

Reference: `proxy_set_header` directives are inherited only if a block defines none of its own, so these must sit with the block's other `proxy_set_header` lines. `$geoip2_country_code` is empty for unknown addresses, which makes the app use its browser-language fallback.

## Checking that it works

Run from a machine in the Netherlands, without sending any country header:

```bash
curl -sS -o /dev/null -D - -H 'Accept: text/html' -H 'Accept-Language: en-GB' https://staging.stagedeskpro.com/pricing | grep -iE '^(HTTP|location|cache-control)'
# Expected: 307, location: /nl/pricing, cache-control: private, no-store
```

Option B only: forged headers must lose. From outside the Netherlands:

```bash
curl -sS -o /dev/null -D - -H 'Accept: text/html' -H 'Accept-Language: en-GB' -H 'CF-IPCountry: NL' https://staging.stagedeskpro.com/pricing | grep -iE '^(HTTP|location)'
# Expected: 200 and no location
```

## Staging QA checklist

Use a fresh browser profile or private window for each visitor. Real IPs or a VPN exit in that country; a test header doesn't prove the server is set up.

| # | Step | Expected |
|---|---|---|
| 1 | Open the site from a Netherlands IP | `/nl`, Dutch |
| 2 | Look at the currency in the header | EUR |
| 3 | Open the pricing page | Prices in €, no estimate note |
| 4 | Choose English in the language menu | Same page in English, still EUR |
| 5 | Refresh | English stays |
| 6 | Choose GBP in the currency menu | Prices in £, estimate note, "You pay in euros" |
| 7 | Refresh | GBP stays |
| 8 | Choose "Automatic" in both menus | Back to Dutch and EUR |
| 9 | Repeat steps 1–8 on a phone | Same, and the menu keeps the settings |
| 10 | UK IP, fresh browser | English, GBP |
| 11 | US IP, fresh browser | English, USD |
| 12 | Start a plan checkout after choosing GBP (Stripe test mode) | Stripe shows the euro price |

## Cookies

| Cookie | Written when | Lasts |
|---|---|---|
| `locale_choice` | The visitor picks a language (site menu, app user menu, profile). Removed by "Automatic". | 1 year |
| `display_currency` | The visitor picks a currency. Removed by "Automatic". | 1 year |

Detected values are never stored. The old `visitor_locale` cookie is removed on the next page load: it held guesses and real choices alike, so it can't be trusted.
