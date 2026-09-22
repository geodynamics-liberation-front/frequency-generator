# Frequency Generator: a static site that lives in html/.
#
#   make dist     copy the site into dist/ (the build contract for therealglf.org)
#   make serve    serve dist/ on http://localhost:8000/
#   make test     run the unit tests
#   make clean    remove dist/

.PHONY: dist serve test clean

dist:
	rm -rf dist
	cp -r html dist

serve: dist
	python3 -m http.server 8000 --directory dist

test:
	node --test test/*.test.js

clean:
	rm -rf dist
