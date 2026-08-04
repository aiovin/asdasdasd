# Passphrase Board

A tiny browser-based generator for memorable passphrases, passwords, or nicknames - built on the [xkcdpass](https://github.com/redacted/XKCD-password-generator) wordlists ([xkcd #936](https://xkcd.com/936/)) method of stringing together real dictionary words instead of random characters. Runs entirely client-side, no backend required.

## Why "asdasdasd"?

Some Path of Exile players get lazy naming a new character and just mash the keyboard, ending up with something like "asdasd". This tool exists so that if you're going to be lazy anyway, you can at least get something fun and unique instead.

## Run locally

```
python3 -m http.server 5000
```

## How to add a new wordlist

- Drop a .txt file (one word per line) into the `data/` folder
- Add one entry to `data/manifest.json`: `{ "file": "yours.txt" }`

"label" and "description" are optional.