# parseDuration ignores everything after the first unit

`parseDuration('1h30m')` returns 3600 instead of 5400. Combined units must add up,
and anything that is not a valid duration must throw.
Test: `node --test test/duration.test.js`
