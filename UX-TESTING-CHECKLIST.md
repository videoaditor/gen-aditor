# UX Testing Checklist - "Stupid Simple" Standard

**Rule:** If it needs explanation, it's broken.

Before saying "ready to test":

---

## 1. First Impressions (10 seconds)

- [ ] Can you tell what this does without reading?
- [ ] Is there ONE obvious action to take?
- [ ] Does it look alive, not intimidating?

---

## 2. Input Fields

- [ ] Pre-filled with working example (not empty)
- [ ] Placeholder text is helpful, not technical
- [ ] Clear what format/type of data goes here
- [ ] "Clear" or "Reset" button visible

---

## 3. Buttons & Actions

- [ ] Button text is simple ("Next", "Generate", not "Analyze Script")
- [ ] One primary action per screen (big, obvious)
- [ ] Secondary actions are smaller/less prominent
- [ ] Loading states say what's happening ("Creating frames..." not "Processing...")

---

## 4. Error Messages

- [ ] Emoji + human language (📝 "Paste your script" not "Error: script required")
- [ ] Tell user what to DO, not what went wrong
- [ ] No technical jargon (no "failed to parse", "API error", etc.)
- [ ] Console.log the real error for debugging

**Good errors:**
- ✅ "📝 Paste your script in the box above"
- ✅ "⚠️ Couldn't load that page. Try a different URL."
- ✅ "✍️ Add a bit more text (need at least a few sentences)"

**Bad errors:**
- ❌ "Error: script required"
- ❌ "Failed to analyze: 400 Bad Request"
- ❌ "Script length must be >= 50 characters"

---

## 5. Progress & Feedback

- [ ] User knows something is happening (spinner, percentage, message)
- [ ] Progress messages are reassuring ("Creating frames..." not "Generating...")
- [ ] Success states feel good (✅ emoji, friendly message)
- [ ] No silent failures (if something broke, say so nicely)

---

## 6. Results & Output

- [ ] Clear what to do next ("Click to download", not just images)
- [ ] Success message is celebratory
- [ ] Easy to start over ("New Script" button)
- [ ] Cost/stats are subtle, not scary

---

## 7. The "Uneducated User" Test

Imagine someone who:
- Doesn't read instructions
- Clicks fast without thinking
- Has never used your tool before
- Expects it to "just work"

**Test scenarios:**
- [ ] Clicks "Generate" without entering anything → helpful error
- [ ] Pastes messy script with annotations → works anyway
- [ ] Leaves mid-flow → can pick up or restart easily
- [ ] Gets an error → knows exactly what to do

---

## 8. Mobile Experience

- [ ] Text is readable (not too small)
- [ ] Buttons are big enough to tap
- [ ] Inputs work with mobile keyboard
- [ ] Modals fit on screen

---

## 9. Perception Check

**Ask yourself:**
- Does this feel professional or janky?
- Would I be proud to show this to a client?
- Does it feel fast, even if it's not?
- Does it feel smart, not clunky?

---

## 10. Real User Flow Test

**Actually click through it yourself:**
1. Open the workflow
2. Don't think - just click and type
3. Make mistakes on purpose
4. Try to break it
5. If anything feels weird, fix it

**Never ship without doing this.**

---

## Common UX Sins to Avoid

❌ Empty inputs (intimidating)  
❌ Technical error messages (confusing)  
❌ No examples (user doesn't know format)  
❌ Silent failures (user thinks it's broken)  
❌ Long waits with no feedback (feels stuck)  
❌ Too many options (decision paralysis)  
❌ Jargon ("API", "endpoint", "payload")  
❌ Multiple primary actions (which button?)  
❌ Steps without clear progress (am I done?)  

---

## The Golden Rules

1. **Perception > Reality** - It doesn't matter if it works if it feels broken
2. **Examples > Instructions** - Show, don't tell
3. **Friendly > Accurate** - "Something went wrong" beats "Error 500: Internal Server Error"
4. **One Thing > Many Things** - One obvious action at a time
5. **Fast Feeling > Fast Reality** - Instant feedback + progress beats silent speed

---

**If you can't explain it to a 5-year-old, it's too complex.**

---

**Last step before shipping:**
- [ ] Tested full UI flow as a human
- [ ] All errors are friendly
- [ ] Examples are pre-filled
- [ ] Loading states are clear
- [ ] Success feels good

✅ Now it's ready.
