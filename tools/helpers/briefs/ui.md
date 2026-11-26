Audit the UI: `index.html` (HUD markup + CSS) and `src/index.ts` (HUD logic, input, buttons,
hints, story text, vitals, alerts, end card). Find: duplicated/fragile DOM code, elements that
can overlap (story vs #alert vs #arrived vs #hint, phone layout with joystick + Torch/Crouch/
Jump buttons), inconsistent styles, text that's too small/low contrast, things that update the
DOM every frame unnecessarily (style writes when values didn't change), accessibility basics,
and copy that contradicts the apps-and-games guidance (open straight into the scene, minimal
copy: see /home/bashtv/.pi/agent/skills/apps-and-games/SKILL.md). Propose a cleaner HUD
structure (e.g. a tiny HUD module with a single update(state) and a layout of stacked regions
that can't collide). Include a list of concrete CSS/DOM fixes.
