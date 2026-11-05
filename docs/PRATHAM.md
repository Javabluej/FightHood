# Pratham

Pratham is the ninth playable fighter. His model adapts the existing fully skinned human mesh with a wider jaw, fuller dark beard, reference-based face texture, thick rounded black glasses and a cream hoodie with a folded hood and drawstrings. The face is an artistic adaptation, not a scan. Original shared geometry and Kenny's accepted appearance remain unchanged.

## Ability and dialogue

Ultimate Hurting ignores the incoming call, blocks the contact and breaks the opponent's heart for exactly 32 damage. Phone blocking exists only inside the game cinematic. The move costs the normal full SHAKTI meter and respects the host-authoritative multiplayer flow.

The requested lines are shown as dialogue bubbles:

- U hurted me bro
- why bro ignoring
- Full studiid pa ?
- sometimes its good for health to get hurted

They appear during the ultimate, with additional intro, special-hit, hurt and victory triggers. No recorded voice or voice imitation was generated.

## Assets

Created with the built-in image generation tool, then saved into the project:

- Portrait: public/faces/pratham.png
- Face albedo: public/textures/pratham/head-albedo.png
- Model customization: src/animation/PrathamModel.ts and the shared reference-human pipeline in src/animation/KennyModel.ts
- Character: src/characters/roster/pratham.ts
- Ultimate: src/cinematics/pratham.ts

Rendered model/ultimate screenshots are saved in test-results/pratham-model-closeup.png and test-results/pratham-ultimate.png.

## Exact generation prompts

### prathamPortrait

Create a square realistic fighting-game roster portrait of the young adult man Pratham in the supplied reference photos. Preserve recognizable round face, warm medium-brown Indian skin, full dark eyebrows, short side-parted black hair with volume on top, neatly trimmed full black beard and moustache, gentle slightly amused expression. Use the cream/off-white hoodie from image 2 and the thick rounded-square black eyeglasses worn in image 1. Head and upper shoulders centered, face large and front-facing with a subtle three-quarter angle, detailed realistic skin and cloth, neutral flattering studio lighting, plain deep charcoal background. Match a photographic portrait used beside a realistic 3D game character. No text, logos, watermark, jewelry, props or background venue.

### prathamAtlas

Edit IMAGE 1, a square upside-down UV HEAD TEXTURE ATLAS for a rigged human game character, using the young man in images 2 and 3 as the facial identity reference. Preserve the EXACT atlas layout, upside-down orientation and exact eye, nose, lips, ears and hairline landmark positions from image 1. Do NOT recenter the face or rearrange any parts. Paint realistic diffuse albedo: young warm medium-brown skin, thick dark eyebrows, neat full short black beard and moustache, round soft cheeks, natural pinkish lips, short thick side-parted black hair. Remove all grey hair and aged wrinkles. No glasses in this texture because separate 3D glasses will be attached. Same skin color across neck edge and ears, natural pores, even shadowless lighting. Keep the dark red mouth-interior islands in the two bottom corners. No perspective, no normal portrait, no normal map, no words. Output a UV-ready square texture identical in spatial layout to image 1, only identity and surface appearance changed.
