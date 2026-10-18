# Yuki blink artwork audit

The original PNGs are unchanged. No eye masks, filters, generated artwork, or face deformation are used.

`public/yuki-idle-sheet.png` is 1774 x 887 with four columns and two rows. Row 2, column 1 is the usable neutral closed-eye pose. Idle holds the preceding open-eye pose for a varied interval, closes for 110–159 ms, then reopens using row 2, column 2. The full sprite stays opaque and mounted.

`public/yuki-study-helper.png` is 1024 x 1536 with four columns and six reaction rows. These are action poses, not registered eye-only frame pairs:

| Reaction | Existing closed-eye art | Automatic extra blink |
| --- | --- | --- |
| Greeting | Row 2, column 2: waving with a changed arm/head pose | No matching eye-only counterpart |
| Encouraging / notes | Row 3, column 4: smiling with a thumb up | Preserve the smile; no forced reopening |
| Thinking | Row 4, column 4: smiling with hands down, unlike the chin-resting thinking poses | Closed-eye chin-resting counterparts needed |
| Speaking / explaining | Row 4, column 4 differs from the palm-up speaking pose in column 3 | Closed-eye palm-up counterpart needed |
| Sad / incorrect | Row 5, column 2 lowers the head; column 4 smiles in reassurance | Preserve the existing sympathetic sequence |
| Happy / correct | Row 6, columns 2–4 are closed-eye happy poses | Preserve the happy expression; no forced reopening |
| Celebrating | Row 6, column 3 is a closed-eye jumping pose | Preserve the celebration; no forced reopening |

For blinking during these reaction poses, supply registered open/closed-eye counterparts with identical body, hands, head alignment, outfit, and dimensions. Do not replace them with the idle face. Brief reactions return to the blinking idle state; thinking remains in its actual thinking pose while a request is pending.

Automatic frame changes stop offscreen, on hidden pages, and with reduced motion. Existing reaction labels remain accessible. A single frame timer handles the idle blink and reaction sequence; both atlases are preloaded and decoded before timed transitions start.
