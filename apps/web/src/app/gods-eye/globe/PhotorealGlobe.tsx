'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import {
  TilesRenderer,
  TilesPlugin,
  GlobeControls,
  TilesAttributionOverlay,
} from '3d-tiles-renderer/r3f';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';

import { cameraForPoi } from './geo';
import type { POI } from '../locations/pois';

type Props = {
  apiKey: string;
  target: POI | null;
};

// Fly-to tween rate. Lower = slower / more cinematic. 0.045 ≈ 1s to settle.
const TWEEN_RATE = 0.045;
// Below this distance we consider the fly complete and hand control back.
const SETTLE_DISTANCE = 50; // meters

export function PhotorealGlobe({ apiKey, target }: Props) {
  const { camera } = useThree();

  // Desired pose the camera tweens toward. `active` flips on when a POI
  // is clicked and flips back off when the camera has arrived, so that
  // GlobeControls can take over free navigation without fighting us.
  const desired = useMemo(
    () => ({
      position: new THREE.Vector3(),
      lookAt: new THREE.Vector3(),
      active: false,
    }),
    [],
  );

  useEffect(() => {
    if (!target) return;
    const pose = cameraForPoi(
      target.lat,
      target.lon,
      target.altitude,
      target.heading ?? 0,
      target.pitch ?? -45,
    );
    desired.position.copy(pose.position);
    desired.lookAt.copy(pose.target);
    desired.active = true;
  }, [target, desired]);

  useFrame(() => {
    if (!desired.active) return;
    camera.position.lerp(desired.position, TWEEN_RATE);
    // Note: not tweening up vector — GlobeControls maintains geodetic up
    // on its own, and writing to it here causes a tug-of-war.
    camera.lookAt(desired.lookAt);
    if (camera.position.distanceTo(desired.position) < SETTLE_DISTANCE) {
      desired.active = false;
    }
  });

  // Set sane near/far for Earth-scale ECEF coordinates on first render.
  // Without this the default near=0.1/far=1000 nukes the whole scene.
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = 1;
    cam.far = 200_000_000;
    cam.updateProjectionMatrix();
    initRef.current = true;
  }, [camera]);

  return (
    <TilesRenderer>
      {/* Google Photoreal 3D Tiles auth — swaps the default tileset URL
          for the Google Map Tiles endpoint and handles session tokens. */}
      <TilesPlugin
        plugin={GoogleCloudAuthPlugin}
        args={[{ apiToken: apiKey, autoRefreshToken: true }]}
      />
      {/* Google-Earth-style orbit / zoom / pan. Free navigation. */}
      <GlobeControls enableDamping />
      {/* Google TOS: attribution must be visible. This renders an overlay
          inside the Canvas with the required credits. */}
      <TilesAttributionOverlay />
    </TilesRenderer>
  );
}
