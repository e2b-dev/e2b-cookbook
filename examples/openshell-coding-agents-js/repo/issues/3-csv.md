# parseCsvLine breaks on quoted fields

`parseCsvLine('"Smith, John",42')` splits inside the quotes. Quoted fields can
contain commas, and `""` inside quotes is a literal quote.
Test: `node --test test/csv.test.js`
