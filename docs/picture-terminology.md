# Picture Terminology

This document defines how to talk about pictures in Bear Editor and `.lev`
files.

## Core rule

Use **picture** as the umbrella term for every entry in `state.pictures` and
every item in `.lev` `pictures`.

A picture can be one of two subtypes:

- **Sprite picture**: a one-off image selected by `name`.
- **Texture**: a picture built from `texture` + `mask`.

## Why this split

In the data model, both are the same entity:

- they live in the same `pictures` collection
- they share `position`
- they share `distance`
- they share `clip`

But they are not the same kind of visual source:

- a **sprite picture** gets pixels from `name`
- a **texture** gets pixels from `texture` and `mask`

That is the distinction worth naming in docs and conversations.

## Recommended language

When talking about all of them together:

- say **picture**
- say **picture properties** for shared fields like `position`, `distance`, and
  `clip`
- say **picture placement** when you mean where and how a picture is layered

When talking about the one-off image variant:

- say **sprite picture**
- avoid **non-texture picture** unless the negative contrast is the point

When talking about the masked/tiled variant:

- say **texture**
- say **texture mask** when the mask itself matters
- say **masked texture picture** only when you need to be explicit that it is
  still a picture record

## Mapping to fields

- **picture**
  - any record with shared picture fields
- **sprite picture**
  - `name` is set
  - `texture` and `mask` are empty
- **texture**
  - `texture` and `mask` are set
  - `name` is empty

## Recommended phrasing

- "Pictures share placement properties like distance and clipping."
- "A texture is still a picture, but it uses `texture` and `mask` instead of
  `name`."
- "The picture tool creates sprite pictures."
- "The texture tool creates textures."
- "This behavior applies to all pictures."
- "This behavior only applies to sprite pictures."
- "This behavior only applies to textures."

## Avoid

- using **picture** to mean only the `name`-based variant when textures are also
  in scope
- using **texture** to mean every picture
- switching between **image**, **picture**, and **texture** for the same concept
  without saying which level you mean

## Short version

If in doubt:

- **picture** = umbrella term
- **sprite picture** = `name`-based picture
- **texture** = `texture` + `mask` picture
