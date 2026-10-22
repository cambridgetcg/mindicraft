# The offline book: a roadmap

Mindicraft is written for the hours when ordinary help is slow. For most
readers the likeliest of those hours is a power cut at home: the phone still
has some charge from a power bank or a small solar panel, but the wifi is
down and the mobile network may be failing too. A survival book that only
opens online fails at exactly that moment.

Each stage below makes the book more useful with no connection. None of them
changes what the book says without the review the book already asks for.

## Before any stage ships

The public build has been stopped since 2026-09-03, because the wildfire
review expired (`guide/wildfire-review.json`). A person has to re-review the
wildfire shelf and re-pin it. Moving the date to get a build through would
make the receipt say something untrue, so that is not an option.

## Stage 0: field cards (in review)

Every guide opens onto a card: what to have ready, the steps, and the
warnings, whole and in the author's order, with the why on the back. "Print
this card" prints the front on one sheet for most guides.

Paper is the first offline copy. Before the power goes, print the cards you
would want in the drawer.

## Stage 1: save the book for offline

- **An explicit choice.** "Save this book for offline" is a tap the reader
  makes, never a silent download. One language of the book is about
  1–1.2 MB compressed (about 2.7 MB on disk); the API files are not needed
  for reading and stay online.
- **A page that says what this copy is.** It lists the edition date, the
  languages saved, and when each reviewed shelf's review runs out.
- **Dates that stay honest offline.** Past a shelf's review date, the saved
  copy shows a banner saying to check official sources when you can. The
  content stays visible.
- **A plain-text download** of the whole book, for any device and any
  printer.
- **A privacy page.** `mindicraft.com/privacy` does not exist yet. The
  offline book needs one, and it should say plainly: no accounts, no
  tracking.

## Stage 2: when the power goes out at home

Today the book has no page about power cuts. This would be a new shelf, with
the same discipline as the wildfire shelf: named sources, a review receipt
with an expiry, and all four languages with bilingual review. Topics a
reviewer would need to check:

- carbon monoxide from generators, barbecues, heaters and camping stoves
  used indoors
- food in a fridge or freezer without power, and when to throw it out
- water when pumps stop
- staying warm, or staying cool
- light without fire risk
- keeping phones and power banks charged, and making the charge last
- medical devices that need power
- who to tell, and how to get help when lines are down

Some craft guides already help here, such as staying warm without fire,
boiling and storing water, and first aid. Others, like an open fire, are
wrong indoors. Linking them from this shelf is a reviewed choice, not a
keyword match.

## Stage 3: an iOS app

The offline book as an app, built through
[orchard](https://github.com/cambridgetcg/orchard) and published by
Mindicraft Limited: the field cards, search, and saved editions with their
review dates. Known App Review risks are guideline 4.2 (an app has to do
more than a repackaged website) and 1.4.1 (apps with medical information
get closer scrutiny). It also needs the privacy page and a support page.

## Stage 4: Android

Orchard's Android decision is still open, and so is the question of which
account publishes it.

## Throughout

- No accounts, no tracking, no gate.
- Every offline copy shows its edition and review dates.
- An English page standing in for a missing translation says so.
- Safety text is never shortened, folded away, or summarised in new words
  without review.
