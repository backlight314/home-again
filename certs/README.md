# TigerData certificate

`timescale-ca.pem` is the public certificate of Timescale's own certificate authority
(`ca.timescale.com`), which signs TigerData database servers. Node doesn't trust it by
default, so `tiger.js` trusts it explicitly and keeps full certificate verification on.

It expires in **October 2027**. To refresh it, save the second certificate that the
server sends:

```sh
echo | openssl s_client -starttls postgres -connect <host>:<port> -showcerts 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/{n++} n==2{print} /END CERTIFICATE/ && n==2{exit}' > certs/timescale-ca.pem
```

or set `TIGER_CA_FILE` to a certificate file from TigerData.
