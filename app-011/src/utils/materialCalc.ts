import type { Room, Opening, MatSpec, MaterialResult } from '../types';
import { polygonArea, polygonPerimeter } from './geometry';

export const DEFAULT_MATS: MatSpec[] = [
  { id: 'paint', name: '乳胶漆', unit: 'm2', coverage: 12, lossRate: 0.05, price: 35 },
  { id: 'primer', name: '底漆', unit: 'm2', coverage: 14, lossRate: 0.05, price: 25 },
  { id: 'tile_800', name: '瓷砖800×800', unit: 'pcs', coverage: 0.64, lossRate: 0.08, price: 85 },
  { id: 'tile_300', name: '瓷砖300×600', unit: 'pcs', coverage: 0.18, lossRate: 0.1, price: 12 },
  { id: 'floor', name: '木地板', unit: 'm2', coverage: 1, lossRate: 0.05, price: 180 },
  { id: 'wallpaper', name: '壁纸(0.53m×10m)', unit: 'roll', coverage: 5, lossRate: 0.15, price: 120 },
  { id: 'skirting', name: '踢脚线', unit: 'm', coverage: 1, lossRate: 0.03, price: 25 },
];

export function calcMaterials(
  rooms: Room[],
  openings: Opening[],
  materials: MatSpec[]
): MaterialResult[] {
  const results: MaterialResult[] = [];
  const matMap = new Map(materials.map((m) => [m.id, m]));

  for (const room of rooms) {
    const area = polygonArea(room.polygon);
    const perim = polygonPerimeter(room.polygon);
    const wallArea = perim * room.heightMm;

    const roomOpenings = openings.filter((o) => o.roomId === room.id);
    let windowArea = 0;
    let doorArea = 0;
    for (const other of rooms) {
      const otherOpenings = openings.filter((o) => o.roomId === other.id);
      for (const o of otherOpenings) {
        if (o.type === 'window') {
          windowArea += o.widthMm * o.heightMm;
        }
        if (o.type === 'door') {
          doorArea += o.heightMm * o.widthMm;
        }
        if (o.type === 'sliding') {
          doorArea += o.heightMm * o.widthMm;
        }
      }
    }
    const openingArea = windowArea - doorArea;
    const doorsOnWall = (roomId: string, wallIndex: number) =>
      openings.filter(
        (o) =>
          o.roomId === roomId &&
          o.wallIndex === wallIndex &&
          (o.type === 'door' || o.type === 'sliding')
      );
    let doorWidth = 0;
    for (const other of rooms) {
      for (let wi = 0; wi < other.polygon.length; wi++) {
        const onWall = doorsOnWall(other.id, wi);
        for (const od of onWall) {
          const samePlace = roomOpenings.some(
            (o) => o.wallIndex === od.wallIndex && o.offsetMm === od.offsetMm
          );
          if (samePlace) {
            doorWidth += od.widthMm;
          }
        }
      }
    }
    for (const o of roomOpenings) {
      if (o.type === 'door' || o.type === 'sliding') {
        doorWidth += o.widthMm;
      }
    }

    const netWallArea = Math.max(0, wallArea - openingArea);
    const netSkirtingLen = Math.max(0, perim - doorWidth);

    // Floor
    const floorMat = matMap.get(room.floorMat);
    if (floorMat) {
      const qty = area * (1 + floorMat.lossRate);
      let detail = `房间"${room.name}"地面: ${area.toFixed(2)}m² × (1+${(floorMat.lossRate * 100).toFixed(0)}%) = ${qty.toFixed(2)}${floorMat.unit}`;
      if (room.floorMat === 'tile_800') {
        const pcs = Math.ceil(qty / 0.64);
        detail += `，约${pcs}块`;
      } else if (room.floorMat === 'tile_300') {
        const pcs = Math.ceil(qty / 0.18);
        detail += `，约${pcs}块`;
      }
      results.push({
        matId: floorMat.id,
        name: floorMat.name,
        unit: floorMat.unit,
        quantity: qty,
        totalPrice: qty * floorMat.price,
        details: detail,
      });
    }

    // Wall paint or wallpaper
    const wallMat = matMap.get(room.wallMat);
    if (wallMat) {
      const qty = netWallArea * (1 + wallMat.lossRate);
      const detail = `房间"${room.name}"墙面: (${perim.toFixed(0)}mm×${room.heightMm}mm - ${openingArea.toFixed(0)}mm²) × (1+${(wallMat.lossRate * 100).toFixed(0)}%) = ${qty.toFixed(2)}${wallMat.unit}`;
      results.push({
        matId: wallMat.id,
        name: wallMat.name,
        unit: wallMat.unit,
        quantity: qty,
        totalPrice: qty * wallMat.price,
        details: detail,
      });
    }

    // Skirting (if not tile wall)
    if (room.wallMat === 'paint' || room.wallMat === 'wallpaper' || room.wallMat !== 'tile_300') {
      const skMat = matMap.get('skirting');
      if (skMat) {
        const qty = netSkirtingLen * (1 + skMat.lossRate);
        results.push({
          matId: skMat.id,
          name: skMat.name,
          unit: skMat.unit,
          quantity: qty,
          totalPrice: qty * skMat.price,
          details: `房间"${room.name}"踢脚线: (${perim.toFixed(0)} - ${doorWidth.toFixed(0)})mm × (1+${(skMat.lossRate * 100).toFixed(0)}%) = ${qty.toFixed(2)}m`,
        });
      }
    }
  }

  // Merge same materials
  const merged = new Map<string, MaterialResult>();
  for (const r of results) {
    const existing = merged.get(r.matId);
    if (existing) {
      existing.quantity += r.quantity;
      existing.totalPrice += r.totalPrice;
      existing.details += '; ' + r.details;
    } else {
      merged.set(r.matId, { ...r });
    }
  }

  return Array.from(merged.values());
}

export function calcPaintBuckets(areaM2: number, coveragePerBucket: number): number {
  return Math.ceil(areaM2 / coveragePerBucket);
}
