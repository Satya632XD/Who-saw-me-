// MaterialControls.js
// Wires HTML slider inputs to the local player's material properties.

export class MaterialControls {
  constructor(playerMesh, metalnessSliderEl, roughnessSliderEl) {
    this.playerMesh = playerMesh;
    this.metalnessSlider = metalnessSliderEl;
    this.roughnessSlider = roughnessSliderEl;

    this.metalnessSlider.addEventListener('input', (e) => {
      this.playerMesh.setMetalness(parseFloat(e.target.value));
    });

    this.roughnessSlider.addEventListener('input', (e) => {
      this.playerMesh.setRoughness(parseFloat(e.target.value));
    });
  }

  syncSlidersToMaterial() {
    this.metalnessSlider.value = this.playerMesh.material.metalness;
    this.roughnessSlider.value = this.playerMesh.material.roughness;
  }
}
