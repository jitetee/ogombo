# Video studio — this update

Two clearly different videos from one script ("render":"both")
- Talking version: narrator + captions + music + effects. Narrator now moves: pops in, breathes, sways, bounces on every spoken word and changes gesture each sentence.
- Non-talking version = "Visual explainer" (new design, not the talking one with captions removed): top progress rail "STEP 2 OF 6", icon discs, numbered step cards that tick off, progress meter with %, ring gauge for numbers, quote card, sweep transitions. No narrator, no captions.
  Set "design":"same" to make the non-talking one reuse the talking design instead.

Sync
- Checklist ticks, bullet cards, whiteboard lines and chat bubbles now appear when their key word is spoken (found in the narration timings), not on a fixed timer.

Fixes
- Whiteboard hand removed.
- End screen redesigned: fills the screen, holds to the last frame (7 s), Subscribe button, website QR with the web address, only Facebook / Instagram / YouTube / TikTok.
- Wipe / circle / doors transitions now fully cover the old scene (no text on text). Cover-to-hook cross-fade shortened.
- QR links made while testing on localhost now point to https://ezra-ogombo.web.app.

Later update
- Scenes tab → "Make a video from a content card": pick a card from the site (searchable list) and the whole video is built: hook, title, sections (lists become tick-lists, mnemonics like S-C-A-L-P become step lists), and a closing scene saying the link to read more is in the description. End screen says "Link in the description" and the QR opens the card.
- Voice: added Ryan (en_US-ryan-low) as Male 1. Put en_US-ryan-low.onnx and en_US-ryan-low.onnx.json in assets/voices/ (no other files from that download are needed). The bigger LibriTTS voice stays as Male 2–7 if its file is there.
- Speed on phones: stage background is drawn once and reused, preview runs at lower size and 30 fps on phones; this also makes the final render faster.
