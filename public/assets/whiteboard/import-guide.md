# Whiteboard script import guide

Import a JSON file on **Whiteboard studio > Import JSON script** (creates a new project) or inside the editor (**Import JSON...**, append or replace scenes). The importer checks the file first and lists errors (blocking) and warnings (just notes).

Rules of thumb
- One JSON object, no comments, no trailing commas.
- Write the voice-over in `say`. Draw order and timing follow it.
- Keep on-board text short (1-4 words per label). No emoji: use icons or narrator poses.
- Use your own wording and facts only. Do not invent statistics.

## 1. Top-level fields

| field | values | default |
|---|---|---|
| `name` | project name | "Untitled" |
| `format` | `wide` (16:9), `short` (9:16), `square` | `wide` |
| `pace` | drawing speed multiplier. 1 normal, 0.8 slower, 1.3 faster | 1 |
| `font` | `marker` or `hand` | `marker` |
| `handle` | small credit at bottom-left, e.g. `@ezraogombo` | project default |
| `logo` | image path for the round badge | site icon |
| `badge` | letters if no logo | `EO` |
| `bg`, `ink`, `accent`, `blue` | colours as `#rrggbb` | paper, black, red, blue |
| `hand` | `{ "src": "/path.png", "tip": [x,y], "rot": 48.5, "scale": 1.7 }` to use your own hand image | narrator arm |
| `voice`, `music` | optional presets (normally set on the Voice & export page) | none |
| `flow` | `true` (default): the pen stretches each drawing to fill the gap before the next item and leaves the board instead of hovering. `false` for the old fixed timing | true |
| `scenes` | list of scenes (required) | |

## 2. Scene fields

| field | meaning |
|---|---|
| `say` | the voice-over for this scene (1-3 short sentences). Also accepted as `narration`. |
| `layout` | one of `title`, `bullets`, `icons`, `steps`, `compare`, `pie`, `quote`, `narrator` (auto-placed) |
| `items` | extra or fully manual items (section 4). Used after the layout, or alone without `layout`. |
| `hold` | seconds to keep the finished board before the next scene (default about 0.6) |
| `lead` | seconds of eraser wipe before drawing starts (default 0.35 first scene, 0.75 others) |
| `narrator` | optional pose name from the list in section 6 (puts your narrator on the scene). Use `"auto"` to get a pose that fits the words and is not repeated from recent scenes. `"pose":"auto"` also works on a raw `narrator` item. |
| `figure`, `acc` | optional doodle figure pose and accessories instead of the narrator |

A scene needs either a `layout` or `items`.

## 3. Layouts

All layouts accept `title` (and `titleCue`).

- **title**: `title`, `subtitle`, optional `narrator`.
- **bullets**: `bullets: [ "text" | { "text", "icon", "cue" } ]` (up to 7).
- **icons**: `icons: [ { "icon", "label", "cue" } ]` (up to 8, auto-gridded).
- **steps**: `steps: [ { "text", "icon", "cue" } ]` (up to 8). Tags joined by arrows.
- **compare**: `left` and `right`, each `{ "title", "icon", "points": [ "text" | {text,cue} ] }`. Optional `vsText`, or `"vs": false`.
- **pie**: `pct` (0-100), `labels: ["slice", "rest"]`, `points: [...]`, `pieCue`.
- **quote**: `text`, optional `by`.
- **narrator**: `narrator` (pose), `title`, `points: [...]`.

## 4. Raw items (manual placement)

Board units: `wide` is 1600 x 900, `short` 900 x 1600, `square` 1200 x 1200. `x`,`y` is the top-left.

Every item can have `cue` (when to draw), `start` (seconds from the start of the scene body, overrides cue) and `dur` (draw time in seconds).

| type | fields |
|---|---|
| `text` | `x,y,text,size,color,maxW,align` (`left`/`center`) |
| `tag` | `x,y,text,size` (text in a hand-drawn box) |
| `icon` | `x,y,w,name,pack,color,lw` (`pack`: `tabler` default or `lucide`) |
| `figure` | `x,y,w,pose,acc` |
| `narrator` | `x,y,w,pose` |
| `shape` | `x,y,w,h,shape,color,lw` (`box` default, `underline`, `circle`, `line`, `cross`) |
| `arrow` | `x,y,x2,y2,bend,head,color,lw` |
| `pie` | `x,y,r,pct,l1,l2` |
| `image` | `x,y,w,src` (a site path such as `/assets/...`) |
| `emoji` | `x,y,size,char` (optional, avoid unless wanted) |

## 5. Timing and `cue`

- A scene lasts: lead + max(voice length + 0.35 s, last item finished + hold, 1.2 s).
- The voice starts right after the eraser wipe (lead).
- `cue` is a word or phrase copied **exactly** from that scene's `say`. The item starts drawing slightly (0.25 s) before that phrase is spoken, so the hand lands as the word arrives.
- Items without `cue` or `start` are drawn one after another.
- With no voice made yet, timing is estimated from word count and is replaced by the real length once voices exist.
- If a cue is not found in `say`, you get a warning and the item follows normal order.
- Use short, unique cues (`"time out"`, not `"the"`).

## 6. Narrator poses

arms-crossed, arms-wide, cheer-arms-up, clipboard-side, clipboard-write, closeup-top-down, full-body-point, full-body-reach-up, gloves, hand-on-chest, hand-on-forehead, hand-to-head, hands-clasped, hands-down-present, hands-on-head, hands-on-hips, hands-together-thanks, heart-hands, idea-lightbulb, look-up-closeup, neutral, ok-sign, open-hands, palms-up, parts, peace-sign, phone-call-front, phone-call-side, point-at-you, point-hip, point-profile, point-right-closeup, point-right-grin, point-right-lean, point-side-front, point-up-lean, point-up-one, point-up-side, salute, shocked-sparkles, shrug-wide, shush-quiet, stethoscope, thinking-chin, thumbs-up-both, thumbs-up, top-down-smile, wave-back-turned, wave-hello, worried, write-on-board, write-pen-side, writing-notes-side.

## 7. Icons

Names come from Tabler (outline, default) and Lucide (`"pack": "lucide"`). Good ones for theatre content: `user-check`, `clock`, `clipboard-check`, `map-pin`, `file-check`, `alert-triangle`, `heart-rate-monitor`, `shield-check`, `stethoscope`, `bandage`, `microscope`, `vaccine`, `bed`, `hand-stop`, `masks-theater`, `ruler`, `calendar-event`. An unknown name draws a placeholder square and gives a warning.

## 8. Minimal example

```json
{
  "name": "Three pauses",
  "format": "wide",
  "scenes": [
    { "layout": "title", "title": "WHY PAUSE?", "subtitle": "Before the first cut",
      "narrator": "thinking-chin",
      "say": "Why do we pause before the first cut?" },
    { "layout": "steps", "title": "THREE PAUSES",
      "steps": [ { "text": "SIGN IN", "icon": "user-check", "cue": "sign in" },
                 { "text": "TIME OUT", "icon": "clock", "cue": "time out" },
                 { "text": "SIGN OUT", "icon": "clipboard-check", "cue": "sign out" } ],
      "say": "Sign in, time out, and sign out." }
  ]
}
```

More: `examples/who-checklist.json` (layouts) and `examples/raw-items.json` (manual placement).

## 9. Prompt to give an AI

> Write a JSON script for my whiteboard video maker following the guide above. Topic: ___. 6 scenes, about 45 seconds, format wide. Use only layouts and fields in the guide, cue words copied exactly from each `say`, icon names from Tabler, no emoji, no invented statistics. Reply with the JSON only.

The hub also has a **Copy AI prompt** button with a ready-made version.

## New item options (editor and JSON)

- `rot`: rotate any item in degrees, for example `"rot": -4`.
- `crop`: for image items, fractions cut from each side, for example `"crop": {"l":0.1,"r":0.1,"t":0,"b":0.2}`. Also `flip`: true and `opacity`: 0 to 1.
- `eraseAt` (seconds into the scene) or `eraseCue` (a phrase from `say`): the eraser wipes that one item away.
- `{"type":"ink","pts":[[x,y],...],"color":"#e63946","lw":8}`: a freehand stroke drawn over earlier items. Add `"hl":true` for a yellow highlighter. In the editor use "Pen over items" or "Highlighter".

## Audio mixer

On the Voice, audio and export page: voice volume, music volume (default 6 percent), music ducking under the voice, fades, sound-effect volume (whoosh between scenes, pop and ding on items) and extra audio layers with start time, stop time, volume and loop.
