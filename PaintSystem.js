// PaintSystem.js
// Handles the prep-phase camouflage tools: brush painting, bucket fill,
// and an eyedropper that samples color from world objects via raycast.

import * as THREE from 'three';

export const PaintTool = {
  BRUSH: 'brush',
  FILL: 'fill',
  EYEDROPPER: 'eyedropper',
};

export class PaintSystem {
  constructor(sceneManager, localPlayerMesh, onStrokeEmit) {
    this.sceneManager = sceneManager;
    this.playerMesh = localPlayerMesh;
    this.onStrokeEmit = onStrokeEmit; // callback(stroke) -> sent over network

    this.activeTool = PaintTool.BRUSH;
    this.brushColor = '#ffffff';
    this.brushSize = 18;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
  }

  setTool(tool) {
    this.activeTool = tool;
  }

  setBrushColor(hexColor) {
    this.brushColor = hexColor;
  }

  setBrushSize(px) {
    this.brushSize = px;
  }

  // Called when user taps/clicks on their own character model during prep
  // to paint at that UV location.
  handlePaintInputOnSelf(uv) {
    if (this.activeTool === PaintTool.FILL) {
      this.playerMesh.fillAll(this.brushColor);
      this._emitStroke({ type: 'fill', color: this.brushColor });
      return;
    }
    if (this.activeTool === PaintTool.BRUSH) {
      this.playerMesh.paintAt(uv.x, uv.y, this.brushColor, this.brushSize);
      this._emitStroke({
        type: 'brush',
        u: uv.x,
        v: uv.y,
        color: this.brushColor,
        size: this.brushSize,
      });
    }
  }

  // Called when user taps on a world object with the eyedropper active.
  // Samples an approximate color from the object's material.
  sampleColorFromObject(object) {
    const material = object.material;
    if (!material) return null;

    let sampledHex = '#ffffff';
    if (material.color) {
      sampledHex = `#${material.color.getHexString()}`;
    }

    this.brushColor = sampledHex;

    // Also copy physical properties for a more convincing camo match.
    if (typeof material.metalness === 'number') {
      this.playerMesh.setMetalness(material.metalness);
    }
    if (typeof material.roughness === 'number') {
      this.playerMesh.setRoughness(material.roughness);
    }

    return sampledHex;
  }

  // Applies a stroke received from the network (another player painting).
  applyRemoteStroke(remotePlayerMesh, stroke) {
    if (stroke.type === 'fill') {
      remotePlayerMesh.fillAll(stroke.color);
    } else if (stroke.type === 'brush') {
      remotePlayerMesh.paintAt(stroke.u, stroke.v, stroke.color, stroke.size);
    }
  }

  _emitStroke(stroke) {
    if (this.onStrokeEmit) this.onStrokeEmit(stroke);
  }

  // Raycast helper: given a normalized device coordinate click and a list
  // of intersectable objects, returns the first hit with uv (if available).
  raycastFromScreen(ndcX, ndcY, objects, camera) {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, camera);
    const hits = this.raycaster.intersectObjects(objects, false);
    return hits.length > 0 ? hits[0] : null;
  }
}
