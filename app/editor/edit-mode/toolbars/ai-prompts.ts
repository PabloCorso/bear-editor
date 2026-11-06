// Finalize these prompts and the JSON example after the JSON-format PR lands.
export const AI_JSON_EXAMPLE = "JSON format coming soon.";

export const AI_EXAMPLES = [
  {
    id: "image",
    label: "Image to polygons",
    hint: "Attach an image in your AI chat. Silhouettes and high-contrast images work best.",
    prompt: "Image-to-polygons prompt coming soon.",
  },
  {
    id: "level",
    label: "New level",
    hint: "Describe a theme or riding style for a new level.",
    prompt: "New-level prompt coming soon.",
  },
  {
    id: "edit",
    label: "Edit a selection",
    hint: "Copy a selection from Bear Editor and include its JSON with your request. Paste adds a new copy.",
    prompt: "Selection-editing prompt coming soon.",
  },
] as const;
