# Frequency Generator: a static site that lives in html/.
#
#   make dist     copy the site into dist/ (the build contract for therealglf.org)
#   make check    verify the prerequisites
#   make serve    serve dist/ on http://localhost:8000/
#   make test     run the unit tests
#   make clean    remove dist/

.PHONY: dist check serve test clean

dist: check
	rm -rf dist
	cp -r html dist

check:
	@test -f html/index.html || { echo "html/index.html is missing" >&2; exit 1; }
	@command -v python3 >/dev/null || echo "note: python3 is not installed; make serve will not work" >&2

serve: dist
	python3 -m http.server 8000 --directory dist

test:
	node --test test/*.test.js

clean:
	rm -rf dist
