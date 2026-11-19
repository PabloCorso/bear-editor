export type AiPrompt = {
  id: string;
  label: string;
  hint: string;
  prompt: string;
};

type AiPromptGroup = {
  id: string;
  label: string;
  prompts: readonly AiPrompt[];
};

const POLYGON_OUTPUT_INSTRUCTIONS = `## Output

Return only valid JSON, with no Markdown fences or explanation, using this Bear Editor selection structure:
\`\`\`json
{
  "polygons": [
    {
      "vertices": [
        [0, 0],
        [8, 0],
        [4, 6]
      ]
    },
    {
      "vertices": [
        [0, 8],
        [4, 7]
      ],
      "grass": true
    }
  ]
}
\`\`\`

Replace the example triangle with the generated content. Use finite numbers for all coordinates and ensure every polygon is valid.

The result must be ready to copy and paste directly into Bear Editor using Ctrl+V or Cmd+V.`;

const CUSTOM_OUTPUT_INSTRUCTIONS = `## Output

Return only valid JSON, with no Markdown fences or explanation, using this Bear Editor selection structure:
\`\`\`json
{
  "polygons": [
    {
      "vertices": [
        [0, 0],
        [8, 0],
        [4, 6]
      ]
    }
  ],
  "apples": [
    {
      "position": [3, 1],
      "animation": 3,
      "gravity": 1
    }
  ],
  "killers": [[6, 0]],
  "flowers": [[7, 1]],
  "pictures": [
    {
      "name": "barrel",
      "position": [2, 1]
    },
    {
      "texture": "brick",
      "mask": "maskbig",
      "position": [5, 2],
      "distance": 500,
      "clip": 1
    }
  ]
}
\`\`\`

Replace the example content with the generated content. Include only the collections and properties the request needs. Use finite numbers for all coordinates and ensure every polygon is valid.

The result must be ready to copy and paste directly into Bear Editor using Ctrl+V or Cmd+V.`;

function withOutputInstructions(prompt: string, outputInstructions: string) {
  return `${prompt.trim()}\n\n${outputInstructions}`;
}

const IMAGE_TO_POLYGONS_PROMPT = withOutputInstructions(
  `# Image to Elasto Mania Polygons

Convert the attached image into Elasto Mania polygons that can be pasted directly into Bear Editor.

## Goal

Reconstruct the image as faithfully as possible using Elma's two-color ground/sky geometry, similar to vectorizing an image into SVG paths.

Prioritize visual fidelity, not playability. Preserve silhouettes, proportions, curves, holes, negative spaces, and recognizable details.

Use as many polygons and vertices as the image reasonably requires. Simplify unnecessary geometry without sacrificing meaningful detail.

## Geometry

- Polygons consist of ordered \`[x, y]\` vertex tuples in world coordinates.
- Omit \`grass\`; Bear Editor defaults it to \`false\`.
- Polygons define ground/sky boundaries, not individually colored shapes. Use nested contours to create holes and cutouts.
- Use narrow filled polygons for strokes and fine details when appropriate.
- Avoid self-intersections, degenerate polygons, and unnecessary overlaps.
- Preserve the image's aspect ratio and center the artwork around (0, 0).
- Scale the longest dimension to approximately 20 world units, unless instructed otherwise.
- Maximum limits: 1,200 polygons, 20,000 total vertices, and 1,000 vertices per polygon.

### Coordinate orientation

**Bear Editor uses the same coordinate orientation as image pixels: Y increases downward.**

- Positive X points right.
- Positive Y points down.
- The top of a centered image must correspond to negative Y coordinates.
- The bottom of a centered image must correspond to positive Y coordinates.
- Convert image pixels using \`worldY = (pixelY - imageHeight / 2) * scale\`; do not negate Y.
- The artwork's orientation must match the original image exactly.`,
  POLYGON_OUTPUT_INSTRUCTIONS,
);

export const AI_PROMPT_GROUPS = [
  {
    id: "images",
    label: "From images",
    prompts: [
      {
        id: "image-polygons",
        label: "Image to polygons",
        hint: "Attach the image you want to convert, then use this prompt.",
        prompt: IMAGE_TO_POLYGONS_PROMPT,
      },
    ],
  },
  {
    id: "custom",
    label: "Build your own",
    prompts: [
      {
        id: "custom-prompt",
        label: "Make your own prompt",
        hint: "Add your request above these output instructions.",
        prompt: CUSTOM_OUTPUT_INSTRUCTIONS,
      },
    ],
  },
] as const satisfies readonly AiPromptGroup[];
