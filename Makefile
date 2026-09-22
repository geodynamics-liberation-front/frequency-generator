# Frequency Generator: a static site that lives in html/.
#
#   make dist     build the site into dist/ (the build contract for therealglf.org)
#   make check    verify the prerequisites; exits non-zero and says what is missing
#   make serve    serve dist/ on http://localhost:8000/
#   make test     run the unit tests (Node 20 or newer)
#   make clean    remove dist/ and other generated files
#
# There is nothing to download or generate: dist/ is a copy of html/ without
# the developer-only files. The copy is made in a temporary directory and
# moved into place at the end, so a failed build never leaves a partial dist/.

PYTHON ?= python3

.PHONY: dist check serve test clean

dist: check
	rm -rf dist dist.tmp
	cp -r html dist.tmp
	rm -f dist.tmp/test.html
	mv dist.tmp dist

check:
	@test -f html/index.html || { echo "html/index.html is missing: run make from the repository root" >&2; exit 1; }
	@command -v $(PYTHON) >/dev/null || { echo "python3 is required (for make serve): install Python 3" >&2; exit 1; }

serve: dist
	$(PYTHON) -m http.server 8000 --directory dist

test:
	@command -v node >/dev/null || { echo "node is required (for make test): install Node 20 or newer" >&2; exit 1; }
	node --test test/*.test.js

clean:
	rm -rf dist dist.tmp
