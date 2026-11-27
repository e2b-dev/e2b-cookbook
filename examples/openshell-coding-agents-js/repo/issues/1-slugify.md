# slugify leaves extra dashes

`slugify('Hello, World!')` returns `hello--world-` instead of `hello-world`. Runs of
other characters should become one dash, with no dash at either end.
Test: `node --test test/slugify.test.js`
