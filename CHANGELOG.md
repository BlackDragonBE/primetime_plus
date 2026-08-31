# Changelog

## 1.2.4

- JVU/verlof for today is re-read a few times (20s apart) after load when the
  first read comes back empty, instead of caching a possibly-unloaded zero for
  the whole day. A non-zero read is trusted right away.
- Visiting Afwezigheidsplanning invalidates today's cached value, so leave added
  there is picked up on the next predictor tick.

## 1.2.3

- Week/month Δ in the totals panel is now measured against the summed **Rooster**
  column instead of a fixed 40:30, so weekends, feestdagen and half days no longer
  count as missed hours (a weekend-only first week of the month showed -40:30).
- Totals panel shows the Rooster target as its own column.

Earlier versions: see the [releases](https://github.com/BlackDragonBE/primetime_plus/releases).
