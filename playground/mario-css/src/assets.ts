/**
 * Assets SVG inline — zéro image externe, pur CSS + SVG.
 */

const svg = (content: string, w = 16, h = 16) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' shape-rendering='crispEdges'>${content}</svg>`;

export const ASSETS = {
  MARIO_IDLE: svg(`
    <rect x='5' y='0' width='6' height='3' fill='%23e84040'/>
    <rect x='4' y='3' width='8' height='2' fill='%23e8a840'/>
    <rect x='3' y='5' width='4' height='2' fill='%23e8a840'/>
    <rect x='4' y='5' width='8' height='5' fill='%232060e8'/>
    <rect x='4' y='7' width='2' height='3' fill='%23e8a840'/>
    <rect x='10' y='7' width='2' height='3' fill='%23e8a840'/>
    <rect x='4' y='13' width='3' height='3' fill='%23804000'/>
    <rect x='9' y='13' width='3' height='3' fill='%23804000'/>
  `),
  MARIO_WALK: svg(`
    <rect x='5' y='0' width='6' height='3' fill='%23e84040'/>
    <rect x='4' y='3' width='8' height='2' fill='%23e8a840'/>
    <rect x='3' y='5' width='4' height='2' fill='%23e8a840'/>
    <rect x='4' y='5' width='8' height='5' fill='%232060e8'/>
    <rect x='3' y='8' width='3' height='3' fill='%23e8a840'/>
    <rect x='10' y='7' width='3' height='2' fill='%23e8a840'/>
    <rect x='5' y='13' width='4' height='3' fill='%23804000'/>
    <rect x='9' y='12' width='3' height='2' fill='%23804000'/>
  `),
  MARIO_JUMP: svg(`
    <rect x='5' y='0' width='6' height='3' fill='%23e84040'/>
    <rect x='4' y='3' width='8' height='2' fill='%23e8a840'/>
    <rect x='2' y='5' width='5' height='2' fill='%23e8a840'/>
    <rect x='4' y='5' width='8' height='5' fill='%232060e8'/>
    <rect x='1' y='7' width='3' height='3' fill='%23e8a840'/>
    <rect x='12' y='7' width='3' height='3' fill='%23e8a840'/>
    <rect x='4' y='13' width='3' height='3' fill='%23804000'/>
    <rect x='9' y='13' width='3' height='3' fill='%23804000'/>
  `),
};
