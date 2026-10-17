"""Fetch a URL with curl_cffi (Safari fingerprint) for the Node test shim; BWF blocks Node."""
import sys

from curl_cffi import requests

r = requests.get(sys.argv[1], impersonate="safari", timeout=25)
sys.stderr.write(str(r.status_code))
sys.stdout.write(r.text)
