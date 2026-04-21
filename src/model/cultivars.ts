export interface Cultivar {
  id: string;
  name: string;
  taxonomicName: string;
  variety: string | null;
  color: string;
  footprintFt: number;
  spacingFt: number;
}

const cultivars: Cultivar[] = [
  { id: 'tomato', name: 'Tomato', taxonomicName: 'Solanum lycopersicum', variety: null, color: '#E05555', footprintFt: 1, spacingFt: 2 },
  { id: 'basil', name: 'Basil', taxonomicName: 'Ocimum basilicum', variety: null, color: '#4A7C59', footprintFt: 0.75, spacingFt: 0.5 },
  { id: 'pepper', name: 'Pepper', taxonomicName: 'Capsicum annuum', variety: null, color: '#E07B3C', footprintFt: 1, spacingFt: 1.5 },
  { id: 'lettuce', name: 'Lettuce', taxonomicName: 'Lactuca sativa', variety: null, color: '#7FB069', footprintFt: 0.75, spacingFt: 0.75 },
  { id: 'carrot', name: 'Carrot', taxonomicName: 'Daucus carota', variety: null, color: '#E0943C', footprintFt: 0.5, spacingFt: 0.25 },
  { id: 'cucumber', name: 'Cucumber', taxonomicName: 'Cucumis sativus', variety: null, color: '#2D7A27', footprintFt: 1, spacingFt: 1.5 },
];

const cultivarMap = new Map<string, Cultivar>(cultivars.map((c) => [c.id, c]));

export function getCultivar(id: string): Cultivar | undefined {
  return cultivarMap.get(id);
}

export function getAllCultivars(): Cultivar[] {
  return cultivars;
}
