export type AffineMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export function identityMatrix(): AffineMatrix {
  return [1, 0, 0, 1, 0, 0];
}

export function multiplyMatrix(
  left: AffineMatrix,
  right: AffineMatrix,
): AffineMatrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function translateMatrix(
  matrix: AffineMatrix,
  tx: number,
  ty: number,
): AffineMatrix {
  return multiplyMatrix(matrix, [1, 0, 0, 1, tx, ty]);
}

export function scaleMatrix(
  matrix: AffineMatrix,
  sx: number,
  sy: number,
): AffineMatrix {
  return multiplyMatrix(matrix, [sx, 0, 0, sy, 0, 0]);
}

export function rotateMatrix(
  matrix: AffineMatrix,
  radians: number,
): AffineMatrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return multiplyMatrix(matrix, [cos, sin, -sin, cos, 0, 0]);
}

export function transformPoint(matrix: AffineMatrix, x: number, y: number) {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  };
}
