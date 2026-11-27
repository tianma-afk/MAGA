# Hybrid retrieval retest (2026-11-26)

## 23:24 — direct connection still blocked

```
$ nslookup api.jina.ai
name: api.jina.ai
addresses: 2a03:2880:f117:83:face:b00c:0:25de
           128.242.240.85

$ curl -4 -sS -m 15 -o /dev/null -w 'http_code=%{http_code} time=%{time_total}s\n' \
    https://api.jina.ai/v1/embeddings
curl: (28) Connection timed out after 15001 milliseconds
http_code=000 time=15.001388s

$ curl -6 ... https://api.jina.ai/v1/embeddings
curl: (28) Connection timed out after 10010 milliseconds
http_code=000 time=10.010914s

$ sqlite rows
slides= 0

$ JINA_API_KEY
SET
```

## 23:30 — system proxy works

Windows Internet Settings had a proxy that the automation shell did not inherit:

```
ProxyEnable : 1
ProxyServer : 127.0.0.1:7890
```

With `-x http://127.0.0.1:7890`:

```
$ curl -x http://127.0.0.1:7890 -H "Authorization: Bearer ***" \
    https://r.jina.ai/https://www.example.com
code=200 time=0.677

$ curl -x http://127.0.0.1:7890 -o /dev/null -w "%{http_code}" \
    https://api.jina.ai/v1/embeddings
401        # reachable; unauthenticated request
```

Real index build through the proxy:

```
$ HTTPS_PROXY=http://127.0.0.1:7890 python -m server.retrieval_index
{'total': 340, 'updated': 340, 'deleted': 0}
```

## Conclusion

- The key is valid; the Jina host is reachable **through the user's local proxy**.
- The earlier `0 pages` was caused by the automation shell connecting directly,
  while campus DNS returned intercepted addresses for `api.jina.ai` and
  `r.jina.ai`. It was a **proxy inheritance / network path** problem, not a Jina
  outage and not a code bug.
- The product's direct-connection failure behavior (503 + retry, no silent
  fallback) remains correct and is captured in `screenshots/07-hybrid-index-state.png`.
- Real hybrid evaluation is now run with `HTTPS_PROXY=http://127.0.0.1:7890`.
