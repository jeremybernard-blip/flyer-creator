import { Product } from '../types';

export function generateB2BProductSVG(category: string, designation: string, reference: string, brand?: string): string {
  const cleanCat = (category || "Autre").toUpperCase();
  const cleanDesig = designation ? designation.trim() : "Produit Professionnel";
  const cleanRef = reference ? reference.trim() : "REF-MABEO";
  const cleanBrand = brand && brand.toUpperCase() !== "GÉNÉRIQUE" ? brand.trim() : "MABEO PRO";

  const shortDesig = cleanDesig.length > 40 ? cleanDesig.substring(0, 37) + "..." : cleanDesig;
  const isEpi = cleanCat.includes("EPI") || cleanCat.includes("PROTECTION") || cleanDesig.toLowerCase().includes("gant") || cleanDesig.toLowerCase().includes("casque") || cleanDesig.toLowerCase().includes("lunette") || cleanDesig.toLowerCase().includes("masque") || cleanDesig.toLowerCase().includes("chaussure");
  const isManutention = cleanCat.includes("MANUTENTION") || cleanDesig.toLowerCase().includes("transpalette") || cleanDesig.toLowerCase().includes("diable") || cleanDesig.toLowerCase().includes("chariot") || cleanCat.includes("HAUTEUR") || cleanDesig.toLowerCase().includes("échelle") || cleanDesig.toLowerCase().includes("escabeau");
  const isNettoyage = cleanCat.includes("NETTOYAGE") || cleanCat.includes("ASPIRATION") || cleanDesig.toLowerCase().includes("aspirateur") || cleanDesig.toLowerCase().includes("nettoyeur");
  const isRangement = cleanCat.includes("RANGEMENT") || cleanCat.includes("STOCKAGE") || cleanDesig.toLowerCase().includes("box") || cleanDesig.toLowerCase().includes("armoire") || cleanDesig.toLowerCase().includes("servante");

  let visualIconMarkup = "";
  if (isEpi) {
    visualIconMarkup = `
      <g stroke="%2360a5fa" stroke-width="2" fill="none" transform="translate(300, 190)">
        <path d="M-50,20 C-50,-30 50,-30 50,20 Z" fill="%2360a5fa" fill-opacity="0.1" />
        <path d="M-60,20 L60,20 C60,20 65,22 65,26 C65,30 -65,30 -65,26 C-65,22 -60,20 -60,20 Z" fill="%232563eb" fill-opacity="0.2" />
        <rect x="-10" y="-12" width="20" height="15" rx="3" fill="%2360a5fa" fill-opacity="0.3" />
        <circle cx="0" cy="5" r="8" stroke="%233b82f6" />
        <line x1="-4" y1="5" x2="4" y2="5" />
        <line x1="0" y1="1" x2="0" y2="9" />
      </g>
    `;
  } else if (isManutention) {
    visualIconMarkup = `
      <g stroke="%233b82f6" stroke-width="2" fill="none" transform="translate(300, 190)">
        <polygon points="-50,10 0,35 50,10 0,-15" fill="%232563eb" fill-opacity="0.1" />
        <polygon points="-50,-20 0,5 50,-20 0,-45" fill="%232563eb" fill-opacity="0.2" />
        <line x1="-50" y1="-20" x2="-50" y2="10" />
        <line x1="0" y1="5" x2="0" y2="35" />
        <line x1="50" y1="-20" x2="50" y2="10" />
        <path d="M-20,-50 L-20,-30 M-20,-30 L-25,-35 M-20,-30 L-15,-35" stroke="%2360a5fa" stroke-width="1.5" />
        <path d="M20,-50 L20,-30 M20,-30 L15,-35 M20,-30 L25,-35" stroke="%2360a5fa" stroke-width="1.5" />
      </g>
    `;
  } else if (isNettoyage) {
    visualIconMarkup = `
      <g stroke="%233b82f6" stroke-width="2" fill="none" transform="translate(300, 190)">
        <circle cx="0" cy="0" r="40" stroke="%233b82f6" stroke-dasharray="2 4" />
        <circle cx="0" cy="0" r="25" fill="%232563eb" fill-opacity="0.1" />
        <path d="M0,0 C15,-15 15,-25 10,-30" stroke="%2360a5fa" />
        <path d="M0,0 C-15,15 -15,25 -10,30" stroke="%2360a5fa" />
        <path d="M0,0 C15,15 25,15 30,10" stroke="%2360a5fa" />
        <path d="M0,0 C-15,-15 -25,-15 -30,-10" stroke="%2360a5fa" />
      </g>
    `;
  } else if (isRangement) {
    visualIconMarkup = `
      <g stroke="%233b82f6" stroke-width="2" fill="none" transform="translate(300, 195)">
        <rect x="-40" y="-35" width="80" height="70" rx="3" fill="%232563eb" fill-opacity="0.1" />
        <line x1="-40" y1="-10" x2="40" y2="-10" />
        <line x1="-40" y1="15" x2="40" y2="15" />
        <circle cx="-25" cy="-22" r="3" fill="%2360a5fa" />
        <circle cx="-25" cy="2" r="3" fill="%2360a5fa" />
        <circle cx="-25" cy="27" r="3" fill="%2360a5fa" />
        <line x1="-10" y1="-22" x2="15" y2="-22" stroke="%2360a5fa" stroke-width="1.5" />
        <line x1="-10" y1="2" x2="15" y2="2" stroke="%2360a5fa" stroke-width="1.5" />
        <line x1="-10" y1="27" x2="15" y2="27" stroke="%2360a5fa" stroke-width="1.5" />
      </g>
    `;
  } else {
    visualIconMarkup = `
      <g transform="translate(300, 190)">
        <polygon points="-60,-10 -60,50 0,80 0,20" fill="%231e293b" stroke="%233b82f6" stroke-width="2" />
        <polygon points="0,20 0,80 60,50 60,-10" fill="%230f172a" stroke="%233b82f6" stroke-width="2" />
        <polygon points="0,-40 60,-10 0,20 -60,-10" fill="%232563eb" fill-opacity="0.3" stroke="%233b82f6" stroke-width="2" />
        <line x1="0" y1="20" x2="0" y2="80" stroke="%2360a5fa" stroke-width="2" />
        <polygon points="-45,12 -45,35 -15,50 -15,27" fill="%23f8fafc" fill-opacity="0.9" />
        <path d="M-38,20 L-22,29" stroke="%23334155" stroke-width="1.5" />
        <path d="M-38,26 L-25,33" stroke="%23334155" stroke-width="1.5" />
        <path d="M-38,32 L-29,37" stroke="%23334155" stroke-width="1.5" />
      </g>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450" width="100%" height="100%">
    <rect width="600" height="450" fill="%230f172a" />
    <defs>
      <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M 30 0 L 0 0 0 30" fill="none" stroke="%231e293b" stroke-width="1"/>
      </pattern>
      <linearGradient id="glow" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="%232563eb" stop-opacity="0.15" />
        <stop offset="100%" stop-color="%231d4ed8" stop-opacity="0" />
      </linearGradient>
    </defs>
    
    <rect width="600" height="450" fill="url(%23grid)" />
    <circle cx="300" cy="200" r="150" fill="url(%23glow)" />

    ${visualIconMarkup}

    <circle cx="300" cy="200" r="180" fill="none" stroke="%231e293b" stroke-dasharray="5,5" />

    <rect x="30" y="30" width="160" height="26" rx="4" fill="%233b82f6" fill-opacity="0.15" stroke="%233b82f6" stroke-width="1.5" />
    <text x="110" y="47" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="11" fill="%2360a5fa" font-weight="900" text-anchor="middle" letter-spacing="1.5">${cleanBrand}</text>

    <text x="30" y="390" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="%2394a3b8" letter-spacing="1">${cleanCat}</text>
    <text x="30" y="415" font-family="'Inter', sans-serif" font-size="18" font-weight="700" fill="%23f1f5f9">${shortDesig}</text>
    
    <rect x="420" y="30" width="150" height="26" rx="4" fill="%231e293b" stroke="%23334155" stroke-width="1.5" />
    <text x="495" y="47" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="11" fill="%23cbd5e1" font-weight="700" text-anchor="middle">REF : ${cleanRef}</text>
    
    <text x="570" y="390" font-family="'Inter', sans-serif" font-size="9" fill="%23475569" text-anchor="end" font-weight="bold">PRO-EQUIPMENT SPECIFICATION</text>
    <text x="570" y="410" font-family="'Inter', sans-serif" font-size="9" fill="%231e293b" text-anchor="end" font-weight="bold">MABEO B2B CATALOGUE DE SECOURS</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${svg}`;
}

export const DEMO_PRODUCTS: Product[] = [
  {
    id: 'demo-1',
    reference: 'REF-TUB-450',
    refFabricant: '1504-008',
    marque: 'TUBESCA-COMABI',
    designation: 'Échelle télescopique aluminium 3,80 m',
    prix: 289.00,
    categorie: 'Travail en hauteur',
    imageUrl: generateB2BProductSVG('Travail en hauteur', 'Échelle télescopique aluminium 3,80 m', 'REF-TUB-450', 'TUBESCA-COMABI'),
    description: 'Structure ultra stable en aluminium de qualité aéronautique. Patins antidérapants biseautés pour une adhérence optimale sur tous types d\'angles.',
    searchStatus: 'success'
  },
  {
    id: 'demo-2',
    reference: 'REF-HAI-102',
    refFabricant: 'HAILO-85',
    marque: 'HAILO',
    designation: 'Escabeau professionnel aluminium 6 marches',
    prix: 145.50,
    categorie: 'Travail en hauteur',
    imageUrl: generateB2BProductSVG('Travail en hauteur', 'Escabeau professionnel aluminium 6 marches', 'REF-HAI-102', 'HAILO'),
    description: 'Charnières renforcées autobloquantes et garde-corps de sécurité élancé. Marches XL de 13 cm de profondeur avec cannelures de sécurité.',
    searchStatus: 'success'
  },
  {
    id: 'demo-3',
    reference: 'REF-PRA-025',
    refFabricant: 'GS-25S4',
    marque: 'PRAMAC',
    designation: 'Transpalette manuel renforcé 2,5 Tonnes',
    prix: 399.00,
    categorie: 'Manutention',
    imageUrl: generateB2BProductSVG('Manutention', 'Transpalette manuel renforcé 2,5 Tonnes', 'REF-PRA-025', 'PRAMAC'),
    description: 'Groupe hydraulique monobloc d\'une fiabilité absolue avec soupape de sécurité de surcharge. Timon ergonomique de direction.',
    searchStatus: 'success'
  },
  {
    id: 'demo-4',
    reference: 'REF-FAG-300',
    refFabricant: 'DIAB-300',
    marque: 'FAGUET',
    designation: 'Diable de manutention acier roues pleines 300kg',
    prix: 89.90,
    categorie: 'Manutention',
    imageUrl: generateB2BProductSVG('Manutention', 'Diable de manutention acier roues pleines 300kg', 'REF-FAG-300', 'FAGUET'),
    description: 'Structure tubulaire en acier soudé à haute robustesse. Bavette de chargement rabattable renforcée pour colis volumineux.',
    searchStatus: 'success'
  },
  {
    id: 'demo-5',
    reference: 'REF-KAR-030',
    refFabricant: 'NT-30-1-TL',
    marque: 'KÄRCHER',
    designation: 'Aspirateur eau et poussière NT 30/1 Tact L',
    prix: 485.00,
    categorie: 'Nettoyage Aspiration',
    imageUrl: generateB2BProductSVG('Nettoyage Aspiration', 'Aspirateur eau et poussière NT 30/1 Tact L', 'REF-KAR-030', 'KÄRCHER'),
    description: 'Système d\'un décolmatage automatique du filtre breveté Tact de Kärcher pour aspirer de grandes quantités de poussières de plâtre et béton.',
    searchStatus: 'success'
  },
  {
    id: 'demo-6',
    reference: 'REF-KAR-515',
    refFabricant: 'HDS-5-15U',
    marque: 'KÄRCHER',
    designation: 'Nettoyeur haute pression eau chaude HDS 5/15 U',
    prix: 1699.00,
    categorie: 'Nettoyage Aspiration',
    imageUrl: generateB2BProductSVG('Nettoyage Aspiration', 'Nettoyeur haute pression eau chaude HDS 5/15 U', 'REF-KAR-515', 'KÄRCHER'),
    description: 'Brûleur haute performance pour une eau à 80°C éliminant rapidement les graisses. Conception type brouette pour déplacement vertical aisé.',
    searchStatus: 'success'
  },
  {
    id: 'demo-7',
    reference: 'REF-SYD-020',
    refFabricant: 'SYD-20P',
    marque: 'SYDERIC',
    designation: 'Perceuse à colonne professionnelle d\'atelier Syd 20',
    prix: 2450.00,
    categorie: 'Machine atelier',
    imageUrl: generateB2BProductSVG('Machine atelier', 'Perceuse à colonne d\'atelier Syd 20', 'REF-SYD-020', 'SYDERIC'),
    description: 'Transmission par poulies de précision garantissant un excellent couple. Table de travail orientable inclinable avec rainures en T de bridage.',
    searchStatus: 'success'
  },
  {
    id: 'demo-8',
    reference: 'REF-FAC-006',
    refFabricant: 'ROLL.6M3',
    marque: 'FACOM',
    designation: 'Servante d\'atelier Roll 6 tiroirs rouge édition 2026',
    prix: 429.00,
    categorie: 'Rangement',
    imageUrl: generateB2BProductSVG('Rangement', 'Servante d\'atelier Roll 6 tiroirs rouge', 'REF-FAC-006', 'FACOM'),
    description: '6 tiroirs montés sur glissières télescopiques à ouverture totale. Plan de travail thermoformé résistant aux solvants.',
    searchStatus: 'success'
  }
];
