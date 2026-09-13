---
name: React Native Web ScrollView parent sizing
description: Why modal ScrollViews can overflow instead of scrolling even when the outer card has an explicit height.
---

A `ScrollView` inside a height-bounded modal card still needs its direct parent to participate in the bounded flex layout. In portrait layouts, give that parent `flex: 1` and `minHeight: 0`; otherwise the ScrollView can measure to its full content height and extend below the clipped card.

**Why:** On a 375×667 viewport, setting the card height and `ScrollView` flex alone produced a scroll element whose `clientHeight` equaled its `scrollHeight`; the overflow existed on a non-scrollable ancestor, so the bottom action remained unreachable.

**How to apply:** For modal cards with a fixed/max height and a header above scrolling content, constrain every wrapper between the card and ScrollView. In web tests, verify `scrollHeight > clientHeight` on the element carrying the ScrollView test ID and scroll that element to its actual end.