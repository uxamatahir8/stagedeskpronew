Your website can live on your own domain, like www.youragency.com. We take care of a secure certificate.

## 1. Add the domain

Go to **Website → Domain** and enter your domain, for example www.youragency.com.

## 2. Set up DNS

Sign in at the company where your domain is registered and add the records StageDesk shows:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | www | the address StageDesk shows |
| TXT | _stagedesk | the verification code |

If you also want youragency.com without www, set up a redirect to www at your provider.

## 3. Verify

Choose **Verify**. DNS changes can take up to a few hours. Once verification succeeds, your site is live on your domain and we create a certificate automatically.

## Problems

- **Verification fails:** check that the name is exactly right. Some providers add your domain name themselves; then just enter *www*.
- **Old website showing:** there's still an A record for www. Remove it.
