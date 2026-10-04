import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const NECK_ITEMS = [
  "blue_scarf",
  "camera",
  "flower_lei",
  "gold_medal",
  "green_bow",
  "pearl_necklace",
  "red_tie",
  "white_green_collar",
  "yellow_bandana",
];

const asset = (path) => new URL(`../public/assets/${path}`, import.meta.url);

function pngSize(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function webpSize(buffer) {
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP");

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const length = buffer.readUInt32LE(offset + 4);
    const payload = offset + 8;

    if (type === "VP8X") {
      const width = 1 + buffer.readUIntLE(payload + 4, 3);
      const height = 1 + buffer.readUIntLE(payload + 7, 3);
      return [width, height];
    }
    if (type === "VP8L") {
      const packed = buffer.readUInt32LE(payload + 1);
      return [1 + (packed & 0x3fff), 1 + ((packed >>> 14) & 0x3fff)];
    }
    if (type === "VP8 ") {
      return [buffer.readUInt16LE(payload + 6) & 0x3fff, buffer.readUInt16LE(payload + 8) & 0x3fff];
    }

    offset = payload + length + (length % 2);
  }

  assert.fail("WebP 크기 정보를 찾을 수 없습니다");
}

test("목 액세서리 9종의 분리 레이어와 착용 완성본이 모두 있다", async () => {
  for (const name of NECK_ITEMS) {
    const files = [
      `customization/neck/${name}.png`,
      `optimized/customization/neck/${name}.webp`,
      `approved-items/neck/${name}-overlay.webp`,
      `approved-items/neck/${name}-worn.webp`,
      `optimized/worn/neck/${name}-worn.webp`,
      `optimized/worn-thumb/neck/${name}-worn.webp`,
      `worn/neck/${name}-worn.png`,
    ];

    for (const file of files) {
      const contents = await readFile(asset(file));
      assert.ok(contents.length > 1_000, `${file} 파일이 비어 있습니다`);
    }
  }
});

test("목 액세서리 착용본과 분리 레이어는 1024px 원본을 유지한다", async () => {
  for (const name of NECK_ITEMS) {
    for (const file of [
      `approved-items/neck/${name}-overlay.webp`,
      `approved-items/neck/${name}-worn.webp`,
      `optimized/worn/neck/${name}-worn.webp`,
    ]) {
      assert.deepEqual(webpSize(await readFile(asset(file))), [1024, 1024], file);
    }

    assert.deepEqual(
      pngSize(await readFile(asset(`worn/neck/${name}-worn.png`))),
      [1024, 1024],
      `${name} PNG 착용본`,
    );
    assert.deepEqual(
      webpSize(await readFile(asset(`optimized/worn-thumb/neck/${name}-worn.webp`))),
      [256, 256],
      `${name} 썸네일`,
    );
  }
});

