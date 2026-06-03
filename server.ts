import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy init/getter for Gemini client to prevent crashing on boot if API key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARNING: GEMINI_API_KEY is not defined. Falling back to mocked enrichments.");
      throw new Error("GEMINI_API_KEY is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// In-memory cache to prevent duplicate Gemini and Search lookup requests on the same products
const enrichCache = new Map<string, any>();

// Retry wrapper with exponential backoff for handling transitory Gemini 429 Rate Limits / Quota exhaustion
async function callGeminiWithRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 3000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const errMsg = err?.message || "";
    const isRateLimit = errMsg.includes("429") || errMsg.toLowerCase().includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED");
    if (isRateLimit && retries > 0) {
      console.warn(`[GEMINI] 429 Quota Exceeded. Retrying in ${delayMs / 1000}s... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return callGeminiWithRetry(fn, retries - 1, delayMs * 1.5);
    }
    throw err;
  }
}

// Extract JSON blocks from markdown or plain text response with extreme resilience
function extractJsonFromText(text: string): any {
  if (!text) return null;
  
  let jsonString = text.trim();
  
  // Try pattern ```json ... ```
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/i;
  const match = jsonBlockRegex.exec(jsonString);
  if (match) {
    jsonString = match[1].trim();
  } else {
    // Try general ``` ... ```
    const generalBlockRegex = /```\s*([\s\S]*?)\s*```/;
    const genMatch = generalBlockRegex.exec(jsonString);
    if (genMatch) {
      jsonString = genMatch[1].trim();
    }
  }
  
  // Locate the first '{' and matching last '}'
  const startIdx = jsonString.indexOf("{");
  const endIdx = jsonString.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1) {
    jsonString = jsonString.substring(startIdx, endIdx + 1);
  }
  
  // Clean comments or trailing commas before parsing
  try {
    return JSON.parse(jsonString);
  } catch (err: any) {
    // Remove inline or multi-line comments
    let cleaned = jsonString
      .replace(/\/\/.*$/gm, '') // line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
    
    return JSON.parse(cleaned);
  }
}

// Resilient heuristic designation cleaner for fallback mode
function cleanPhrase(text: string): string {
  if (!text) return "";
  let clean = text.trim();
  
  // Replace multiple spaces
  clean = clean.replace(/\s+/g, ' ');
  
  // Decapitalize words if the whole string is uppercase, but keep Brand names/acronyms capitalized
  if (clean === clean.toUpperCase()) {
    clean = clean.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase());
  }
  
  return clean;
}

// Premium French B2B-style copy heuristic generator for industrial catalogues
function buildHeuristicDescription(designation: string, brand?: string, category?: string): string {
  const cleanBrand = brand && brand.toLowerCase() !== "générique" ? brand : "";
  const cat = (category || "").toLowerCase();
  
  let desc = "";
  if (cat.includes("hauteur") || designation.toLowerCase().includes("échelle") || designation.toLowerCase().includes("escabeau")) {
    desc = `Équipement professionnel robuste conçu pour sécuriser vos interventions en hauteur. Offre une stabilité optimale et répond rigoureusement aux normes de sécurité et de conformité en vigueur.`;
  } else if (cat.includes("manutention") || designation.toLowerCase().includes("transpalette")) {
    desc = `Solution de levage de haute qualité facilitant le déplacement de charges lourdes en atelier ou entrepôt. Maniabilité maximale et conception hautement durable pour un usage intensif quotidien.`;
  } else if (cat.includes("aspiration") || cat.includes("nettoyage") || designation.toLowerCase().includes("aspirateur")) {
    desc = `Équipement de nettoyage industriel professionnel garantissant un environnement de travail sain et propre. Puissance d'aspiration accrue et durabilité éprouvée pour les professionnels les plus exigeants.`;
  } else if (cat.includes("machine") || cat.includes("atelier") || designation.toLowerCase().includes("perceuse")) {
    desc = `Machine-outil d'atelier de qualité professionnelle offrant une précision d'exécution optimale et une résistance à l'usure remarquable pour toutes vos opérations d'usinage et d'entretien.`;
  } else if (cat.includes("rangement") || designation.toLowerCase().includes("servante")) {
    desc = `Système de rangement d'atelier modulaire et ergonomique. Structure renforcée permettant d'ordonner vos outils industriels en toute flexibilité et d'optimiser l'espace de votre poste de travail.`;
  } else if (cat.includes("epi") || cat.includes("protection") || designation.toLowerCase().includes("casque") || designation.toLowerCase().includes("gant") || designation.toLowerCase().includes("lunette")) {
    desc = `Équipement de protection individuelle de haute qualité assurant sécurité et confort maximal face aux risques d'atelier. Conception conforme aux critères de certification et d'hygiène les plus stricts.`;
  } else {
    desc = `Matériel professionnel de conception industrielle éprouvée. Allie parfaitement haute résistance physique, confort d'utilisation et longévité accrue pour garantir la productivité de vos équipes.`;
  }

  if (cleanBrand) {
    const brandName = cleanBrand.toUpperCase();
    return `${designation} conçu par la marque professionnelle ${brandName}. ${desc}`;
  } else {
    return `${designation}. ${desc}`;
  }
}

function generateB2BProductSVG(category: string, designation: string, reference: string, brand?: string): string {
  const cleanCat = (category || "Autre").toUpperCase();
  const cleanDesig = designation ? designation.trim() : "Produit Professionnel";
  const cleanRef = reference ? reference.trim() : "REF-MABEO";
  const cleanBrand = brand && brand.toUpperCase() !== "GÉNÉRIQUE" ? brand.trim() : "MABEO PRO";

  // We can shorten designation to fit inside the SVG beautifully
  const shortDesig = cleanDesig.length > 40 ? cleanDesig.substring(0, 37) + "..." : cleanDesig;
  const isEpi = cleanCat.includes("EPI") || cleanCat.includes("PROTECTION") || cleanDesig.toLowerCase().includes("gant") || cleanDesig.toLowerCase().includes("casque") || cleanDesig.toLowerCase().includes("lunette") || cleanDesig.toLowerCase().includes("masque") || cleanDesig.toLowerCase().includes("chaussure");
  const isManutention = cleanCat.includes("MANUTENTION") || cleanDesig.toLowerCase().includes("transpalette") || cleanDesig.toLowerCase().includes("diable") || cleanDesig.toLowerCase().includes("chariot");
  const isNettoyage = cleanCat.includes("NETTOYAGE") || cleanCat.includes("ASPIRATION") || cleanDesig.toLowerCase().includes("aspirateur") || cleanDesig.toLowerCase().includes("nettoyeur");
  const isRangement = cleanCat.includes("RANGEMENT") || cleanCat.includes("STOCKAGE") || cleanDesig.toLowerCase().includes("box") || cleanDesig.toLowerCase().includes("armoire") || cleanDesig.toLowerCase().includes("servante");

  let visualIconMarkup = "";
  if (isEpi) {
    // Elegant Blueprint safety helmet / shield outline representation
    visualIconMarkup = `
      <g stroke="#60a5fa" stroke-width="2" fill="none" transform="translate(300, 190)">
        <path d="M-50,20 C-50,-30 50,-30 50,20 Z" fill="#60a5fa" fill-opacity="0.1" />
        <path d="M-60,20 L60,20 C60,20 65,22 65,26 C65,30 -65,30 -65,26 C-65,22 -60,20 -60,20 Z" fill="#2563eb" fill-opacity="0.2" />
        <rect x="-10" y="-12" width="20" height="15" rx="3" fill="#60a5fa" fill-opacity="0.3" />
        <!-- Badge cross inside helmet -->
        <circle cx="0" cy="5" r="8" stroke="#3b82f6" />
        <line x1="-4" y1="5" x2="4" y2="5" />
        <line x1="0" y1="1" x2="0" y2="9" />
      </g>
    `;
  } else if (isManutention) {
    // Elegant pallet / load lift sketch
    visualIconMarkup = `
      <g stroke="#3b82f6" stroke-width="2" fill="none" transform="translate(300, 190)">
        <polygon points="-50,10 0,35 50,10 0,-15" fill="#2563eb" fill-opacity="0.1" />
        <polygon points="-50,-20 0,5 50,-20 0,-45" fill="#2563eb" fill-opacity="0.2" />
        <line x1="-50" y1="-20" x2="-50" y2="10" />
        <line x1="0" y1="5" x2="0" y2="35" />
        <line x1="50" y1="-20" x2="50" y2="10" />
        <!-- Arrows of hoist -->
        <path d="M-20,-50 L-20,-30 M-20,-30 L-25,-35 M-20,-30 L-15,-35" stroke="#60a5fa" stroke-width="1.5" />
        <path d="M20,-50 L20,-30 M20,-30 L15,-35 M20,-30 L25,-35" stroke="#60a5fa" stroke-width="1.5" />
      </g>
    `;
  } else if (isNettoyage) {
    // Dynamic vacuum fan / filter cyclone symbol logic
    visualIconMarkup = `
      <g stroke="#3b82f6" stroke-width="2" fill="none" transform="translate(300, 190)">
        <circle cx="0" cy="0" r="40" stroke="#3b82f6" stroke-dasharray="2 4" />
        <circle cx="0" cy="0" r="25" fill="#2563eb" fill-opacity="0.1" />
        <!-- Vortex vanes -->
        <path d="M0,0 C15,-15 15,-25 10,-30" stroke="#60a5fa" />
        <path d="M0,0 C-15,15 -15,25 -10,30" stroke="#60a5fa" />
        <path d="M0,0 C15,15 25,15 30,10" stroke="#60a5fa" />
        <path d="M0,0 C-15,-15 -25,-15 -30,-10" stroke="#60a5fa" />
      </g>
    `;
  } else if (isRangement) {
    // Compact organized industrial tool drawer console representation
    visualIconMarkup = `
      <g stroke="#3b82f6" stroke-width="2" fill="none" transform="translate(300, 195)">
        <rect x="-40" y="-35" width="80" height="70" rx="3" fill="#2563eb" fill-opacity="0.1" />
        <!-- Compartment lines -->
        <line x1="-40" y1="-10" x2="40" y2="-10" />
        <line x1="-40" y1="15" x2="40" y2="15" />
        <circle cx="-25" cy="-22" r="3" fill="#60a5fa" />
        <circle cx="-25" cy="2" r="3" fill="#60a5fa" />
        <circle cx="-25" cy="27" r="3" fill="#60a5fa" />
        <!-- Draw handles -->
        <line x1="-10" y1="-22" x2="15" y2="-22" stroke="#60a5fa" />
        <line x1="-10" y1="2" x2="15" y2="2" stroke="#60a5fa" />
        <line x1="-10" y1="27" x2="15" y2="27" stroke="#60a5fa" />
      </g>
    `;
  } else {
    // Default isometric elegant 3D logistics shipping tool crate
    visualIconMarkup = `
      <g transform="translate(300, 190)">
        <!-- Left face -->
        <polygon points="-60,-10 -60,50 0,80 0,20" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
        <!-- Right face -->
        <polygon points="0,20 0,80 60,50 60,-10" fill="#0f172a" stroke="#3b82f6" stroke-width="2" />
        <!-- Top face -->
        <polygon points="0,-40 60,-10 0,20 -60,-10" fill="#2563eb" fill-opacity="0.3" stroke="#3b82f6" stroke-width="2" />
        
        <!-- Inner engineering lines -->
        <line x1="0" y1="20" x2="0" y2="80" stroke="#60a5fa" stroke-width="2" />
        
        <!-- Sticker badge -->
        <polygon points="-45,12 -45,35 -15,50 -15,27" fill="#f8fafc" fill-opacity="0.9" />
        <path d="M-38,20 L-22,29" stroke="#334155" stroke-width="1.5" />
        <path d="M-38,26 L-25,33" stroke="#334155" stroke-width="1.5" />
        <path d="M-38,32 L-29,37" stroke="#334155" stroke-width="1.5" />
      </g>
    `;
  }

  // Modern corporate slate/industrial theme with blueprint style
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450" width="100%" height="100%">
    <!-- Base Background with subtle grid pattern -->
    <rect width="600" height="450" fill="#0f172a" />
    <defs>
      <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="1"/>
      </pattern>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e3a8a" />
        <stop offset="100%" stop-color="#3b82f6" />
      </linearGradient>
      <linearGradient id="glow" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#2563eb" stop-opacity="0.15" />
        <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0" />
      </linearGradient>
    </defs>
    
    <!-- Grid Overlay -->
    <rect width="600" height="450" fill="url(#grid)" />
    
    <!-- Glowing blue accent backing -->
    <circle cx="300" cy="200" r="150" fill="url(#glow)" />

    <!-- Visual Icon Representation (Category Specific) -->
    ${visualIconMarkup}

    <!-- Technical crosshair overlay -->
    <path d="M 300 15 L 300 45 M 300 355 L 300 385 M 20 200 L 50 200 M 550 200 L 580 200" stroke="#1e293b" stroke-width="1.5" />
    <circle cx="300" cy="200" r="180" fill="none" stroke="#1e293b" stroke-dasharray="5,5" />

    <!-- Corporate B2B Technical Label Header -->
    <rect x="30" y="30" width="160" height="26" rx="4" fill="#3b82f6" fill-opacity="0.15" stroke="#3b82f6" stroke-width="1.5" />
    <text x="110" y="47" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="11" fill="#60a5fa" font-weight="900" text-anchor="middle" letter-spacing="1.5">${cleanBrand}</text>

    <!-- Category Label -->
    <text x="30" y="390" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#94a3b8" letter-spacing="1">${cleanCat}</text>
    
    <!-- Designation Header -->
    <text x="30" y="415" font-family="'Inter', sans-serif" font-size="18" font-weight="700" fill="#f1f5f9">${shortDesig}</text>
    
    <!-- Part Number / Reference Tech Badge -->
    <rect x="420" y="30" width="150" height="26" rx="4" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
    <text x="495" y="47" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="11" fill="#cbd5e1" font-weight="700" text-anchor="middle">REF : ${cleanRef}</text>
    
    <!-- Verified Industrial Equipment Watermark -->
    <text x="570" y="390" font-family="'Inter', sans-serif" font-size="9" fill="#475569" text-anchor="end" font-weight="bold">PRO-EQUIPMENT SPECIFICATION</text>
    <text x="570" y="410" font-family="'Inter', sans-serif" font-size="9" fill="#1e293b" text-anchor="end" font-weight="bold">MABEO B2B CATALOGUE DE SECOURS</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getCategoryFallbackImage(category = "", designation = "", reference = "REF-MABEO", brand = "MABEO PRO"): string {
  return generateB2BProductSVG(category, designation, reference, brand);
}

// HELPER: Extract images from fetched HTML page
function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  const images = new Set<string>();

  // 1. Process img tags using a regex
  const imgTagRegex = /<img\s+[^>]*>/gi;
  let match;
  while ((match = imgTagRegex.exec(html)) !== null) {
    const imgTag = match[0];
    
    // Check various sources: data-src, src, data-lazy-src, srcset
    const srcRegex = /(?:src|data-src|data-lazy-src|srcset)=["']([^"'\s>]+)/i;
    const srcMatch = srcRegex.exec(imgTag);
    if (srcMatch && srcMatch[1]) {
      let src = srcMatch[1].trim();
      if (src.includes(",")) {
        // Take first image in srcset
        src = src.split(",")[0].trim().split(" ")[0].trim();
      }
      images.add(src);
    }
  }

  // 2. Process content absolute URLs inside media folders
  const cdnRegex = /["'](https:\/\/[\w.-]+\/(?:media|images|produits|upload)\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi;
  let cdnMatch;
  while ((cdnMatch = cdnRegex.exec(html)) !== null) {
    images.add(cdnMatch[1]);
  }

  // 3. Process relative URLs in quotes to find product visuals
  const relativeMediaRegex = /["'](\/(?:media|images|produits|upload|fr\/produit)\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi;
  let relativeMatch;
  while ((relativeMatch = relativeMediaRegex.exec(html)) !== null) {
    images.add(relativeMatch[1]);
  }

  // NEW: 3.5. Direct Scene7 image URL scanner (very common in Magento init blocks and scripts on Mabéo site)
  const scene7Regex = /(https:\/\/groupe-mb\.scene7\.com\/is\/image\/groupemb\/[^"'\s?\\#&<>]+)/gi;
  while ((match = scene7Regex.exec(html)) !== null) {
    let imgUrl = match[1].replace(/\\/g, ''); // Remove JSON escaping backslashes if any
    images.add(imgUrl);
  }

  // NEW: 3.8. Deep absolute web image detector for any direct image files mentioned on target screens
  const absoluteImgRegex = /(https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9._]*\.[a-zA-Z]{2,}\/[^\s"'<>#]+?\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>#]+)?)/gi;
  while ((match = absoluteImgRegex.exec(html)) !== null) {
    let imgUrl = match[1].replace(/\\/g, ''); // Clean escaped slash
    images.add(imgUrl);
  }

  // 4. Clean and resolve relative images
  const absoluteUrls: string[] = [];
  try {
    const origin = new URL(baseUrl).origin;
    for (let img of images) {
      img = img.replace(/&amp;/g, '&');
      
      if (img.startsWith("//")) {
        absoluteUrls.push(`https:${img}`);
      } else if (img.startsWith("/")) {
        absoluteUrls.push(`${origin}${img}`);
      } else if (img.startsWith("http://") || img.startsWith("https://")) {
        absoluteUrls.push(img);
      }
    }
  } catch (err) {
    console.warn("[CRAWLER] URL resolving error", err);
  }

  return absoluteUrls;
}

// HELPER: Rate and select the best product photo from crawled list
function selectBestProductImage(images: string[], designation: string, refFabricant: string, reference: string, brand?: string): string | null {
  const lowercaseDes = (designation || "").toLowerCase();
  const lowercaseRef = (refFabricant || "").toLowerCase();
  const lowercaseMabeoRef = (reference || "").toLowerCase();
  const lowercaseBrand = (brand || "").toLowerCase();

  let bestImg: string | null = null;
  let bestScore = -100;

  for (const img of images) {
    const lower = img.toLowerCase();

    // Skip tracking pixels, logos, small icons, arrows, menus, or general web visuals
    if (
      lower.includes("logo") ||
      lower.includes("loader") ||
      lower.includes("spinner") ||
      lower.includes("banner") ||
      lower.includes("header") ||
      lower.includes("footer") ||
      lower.includes("chevron") ||
      lower.includes("arrow") ||
      lower.includes("button") ||
      lower.includes("icon") ||
      lower.includes("menu") ||
      lower.includes("pixel") ||
      lower.includes("spacer") ||
      lower.includes("tracking") ||
      lower.includes("cart") ||
      lower.includes("sprite") ||
      lower.includes("avatar") ||
      lower.includes("star") ||
      lower.includes("social") ||
      lower.includes("fb-") ||
      lower.includes("google") ||
      lower.includes("cookie") ||
      lower.includes("ad/") ||
      lower.endsWith(".svg") ||
      lower.endsWith(".gif")
    ) {
      continue;
    }

    let score = 0;

    // Direct product images directory
    if (lower.includes("/produit") || lower.includes("/product") || lower.includes("/media/") || lower.includes("/visuels/") || lower.includes("/images/")) {
      score += 65;
    }

    // High relevance if manufacturer's reference matches!
    if (lowercaseRef && lowercaseRef.length > 2 && lower.includes(lowercaseRef)) {
      score += 150;
    }

    // Relevance if Mabéo internal reference matches
    if (lowercaseMabeoRef && lowercaseMabeoRef.length > 2 && lower.includes(lowercaseMabeoRef)) {
      score += 100;
    }

    // If brand is present in image name
    if (lowercaseBrand && lowercaseBrand.length > 2 && lower.includes(lowercaseBrand)) {
      score += 40;
    }

    // Words from original product designation
    const words = lowercaseDes.split(/\s+/).filter(w => w.length > 3);
    let matchedWordsCount = 0;
    for (const word of words) {
      if (lower.includes(word)) {
        matchedWordsCount++;
      }
    }
    score += matchedWordsCount * 15;

    // Prefer larger image versions / zoom
    if (lower.includes("_large") || lower.includes("_xl") || lower.includes("zoom") || lower.includes("hd") || lower.includes("original") || lower.includes("visuel-grand")) {
      score += 30;
    }

    // Low priority for tiny thumbnails
    if (lower.includes("thumb") || lower.includes("_small") || lower.includes("/xs/") || lower.includes("/small/")) {
      score -= 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestImg = img;
    }
  }

  // We want to make sure it's a real product image (positive score required)
  return bestScore > 10 ? bestImg : null;
}

// Search Mabéo Industries via their Magento autocomplete AJAX endpoint
async function crawlMabeoAutocomplete(query: string): Promise<string | null> {
  const cleanQ = (query || "").trim();
  if (cleanQ.length < 2) return null;
  
  const url = `https://www.mabeo-industries.com/catalogsearch/result/?q=${encodeURIComponent(cleanQ)}`;
  console.log(`[AUTOCRAWL] Crawling Mabéo autocomplete/search page for query: "${cleanQ}"`);
  
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const resText = await res.text();
      let htmlContent = resText;
      
      // If the response starts like JSON, parse it as JSON
      const trimmedText = resText.trim();
      if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
        try {
          const data = JSON.parse(trimmedText);
          htmlContent = data.html || data.suggest || JSON.stringify(data);
        } catch (jsonErr) {
          // Keep raw content
        }
      }
      
      // Look for scene7 images which is where mabeo hosts product images
      const scene7Regex = /(https:\/\/groupe-mb\.scene7\.com\/is\/image\/groupemb\/[^"'\s?\\#&<>]+)/gi;
      let match;
      const foundImages: string[] = [];
      while ((match = scene7Regex.exec(htmlContent)) !== null) {
        let imgUrl = match[1].replace(/\\/g, ''); // Clean JSON escaping
        if (!imgUrl.toLowerCase().includes('logo') && !foundImages.includes(imgUrl)) {
          foundImages.push(imgUrl);
        }
      }

      // Fallback: search for local media catalog images
      if (foundImages.length === 0) {
        const mabeoImgRegex = /(https:\/\/www\.mabeo-industries\.com\/media\/catalog\/product\/[^"'\s?\\#&<>]+)/gi;
        while ((match = mabeoImgRegex.exec(htmlContent)) !== null) {
          let imgUrl = match[1].replace(/\\/g, '');
          if (!imgUrl.toLowerCase().includes('logo') && !foundImages.includes(imgUrl)) {
            foundImages.push(imgUrl);
          }
        }
      }
      
      if (foundImages.length > 0) {
        // Upgrade image quality to 400x400 pixel size
        let firstImgUrl = foundImages[0];
        if (firstImgUrl.includes('?')) {
          firstImgUrl = firstImgUrl.split('?')[0];
        }
        const cleanedImg = firstImgUrl + "?$400x400$";
        console.log(`[AUTOCRAWL] 🌟 Autocomplete success! Found image: ${cleanedImg}`);
        return cleanedImg;
      }
    } else {
      console.warn(`[AUTOCRAWL] Search fetch failed with status ${res.status} for query: ${cleanQ}`);
    }
  } catch (err: any) {
    console.warn(`[AUTOCRAWL] Autocomplete failed for "${cleanQ}":`, err.message);
  }
  return null;
}

// Crawl and fetch actual product pages from Mabéo to inspect for real pictures
async function crawlMabeoProductImage(
  reference: string,
  refFabricant?: string,
  brand?: string,
  designation?: string,
  groundingUrls: string[] = []
): Promise<string | null> {
  
  // --- STEP 1: Fast & highly reliable Mabéo Autocomplete Crawler endpoint ---
  const autocompleteQueries: string[] = [];
  
  // 1. Ref Fabricant (is the absolute highest precision query on Mabéo search)
  const cleanMfg = refFabricant ? refFabricant.trim() : "";
  if (cleanMfg.length > 2) {
    autocompleteQueries.push(cleanMfg);
    // Try alphanumeric without spacing/hyphens as well if different
    const alphaNum = cleanMfg.replace(/[^a-zA-Z0-9]/g, "").trim();
    if (alphaNum.length > 3 && alphaNum !== cleanMfg) {
      autocompleteQueries.push(alphaNum);
    }
  }

  // 2. Mabéo Reference (from Col A)
  const cleanRef = reference ? reference.trim() : "";
  if (cleanRef.length > 2) {
    autocompleteQueries.push(cleanRef);
  }

  // 3. Clean product designation keywords
  const cleanBrand = brand && brand.toUpperCase() !== "GÉNÉRIQUE" ? brand.trim() : "";
  if (designation && designation.trim().length > 3) {
    const cleanDesig = designation.replace(/[^a-zA-Z0-9éèàçùâêîôûëïüöäÿæœ\s]/g, " ").trim();
    const words = cleanDesig.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      if (cleanBrand) {
        autocompleteQueries.push(`${cleanBrand} ${words.slice(0, 2).join(" ")}`);
      }
      autocompleteQueries.push(words.slice(0, 2).join(" "));
    }
  }

  // Deduplicate and filter queries
  const uniqueQueries = Array.from(new Set(autocompleteQueries)).filter(q => q && q.length >= 2);

  console.log(`[CRAWLER] Starting Mabéo autocomplete probe. Candidate queries:`, uniqueQueries);

  for (const q of uniqueQueries) {
    const crawledImg = await crawlMabeoAutocomplete(q);
    if (crawledImg) {
      return crawledImg;
    }
  }

  // --- STEP 2: General/legacy URL crawlers if autocomplete did not return a result ---
  const directMabeoUrls: string[] = [];

  if (cleanRef.length > 2) {
    directMabeoUrls.push(`https://www.mabeo-industries.com/catalogsearch/result/?q=${encodeURIComponent(cleanRef)}`);
  }
  if (cleanMfg.length > 2) {
    directMabeoUrls.push(`https://www.mabeo-industries.com/catalogsearch/result/?q=${encodeURIComponent(cleanMfg)}`);
  }
  if (brand && designation && designation.trim().length > 3) {
    directMabeoUrls.push(`https://www.mabeo-industries.com/catalogsearch/result/?q=${encodeURIComponent(`${brand.trim()} ${designation.trim()}`)}`);
  }

  const urlsToCheck: string[] = [...directMabeoUrls, ...groundingUrls];
  const uniqueUrls = Array.from(new Set(urlsToCheck)).filter(u => u && u.startsWith("http"));

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  };

  for (const url of uniqueUrls) {
    const lowerUrl = url.toLowerCase();
    
    if (
      lowerUrl.includes("wikipedia.org") ||
      lowerUrl.includes("youtube.com") ||
      lowerUrl.includes("youtu.be") ||
      lowerUrl.includes("facebook.com") ||
      lowerUrl.includes("linkedin.com") ||
      lowerUrl.includes("instagram.com") ||
      lowerUrl.includes("pinterest.com") ||
      lowerUrl.includes("twitter.com") ||
      lowerUrl.includes("x.com") ||
      lowerUrl.includes("trustpilot.com") ||
      lowerUrl.includes("google.com")
    ) {
      continue;
    }

    try {
      console.log(`[CRAWLER] Crawling fallback target URL: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.info(`[CRAWLER] Fetch returned status ${res.status} for ${url}`);
        continue;
      }

      const html = await res.text();
      const extractedImages = extractImagesFromHtml(html, url);

      if (extractedImages.length > 0) {
        const bestImage = selectBestProductImage(extractedImages, designation || "", refFabricant || "", reference, brand);
        if (bestImage) {
          console.log(`[CRAWLER] 🌟 Scraper success! Found image: ${bestImage} on page: ${url}`);
          return bestImage;
        }
      }

      // Deep crawling if this is a Mabéo search page
      if (url.includes("mabeo-industries.com/catalogsearch/result")) {
        const productPathRegex = /href=["']([^"']*(?:-gants-|-casque-|-masque-|-servante-|-echelle-|-perceuse-|\/A-)[^"']*)["']/gi;
        const candidates: string[] = [];
        let pathMatch;
        while ((pathMatch = productPathRegex.exec(html)) !== null) {
          const path = pathMatch[1];
          const lowerPath = path.toLowerCase();
          if (
            !lowerPath.includes("recherche") &&
            !lowerPath.includes("panier") &&
            !lowerPath.includes("contact") &&
            !lowerPath.includes("aide") &&
            !lowerPath.includes("login") &&
            !lowerPath.includes("compte") &&
            !lowerPath.includes("cgv") &&
            !lowerPath.includes("mentions") &&
            !lowerPath.includes("apropos") &&
            !lowerPath.includes("newsletter")
          ) {
            const fullUrl = path.startsWith("/") ? `https://www.mabeo-industries.com${path}` : path;
            if (!candidates.includes(fullUrl)) {
              candidates.push(fullUrl);
            }
          }
        }

        const maxCandidates = candidates.slice(0, 3);
        console.log(`[CRAWLER] Found ${candidates.length} product page link candidates. Deep crawling top ${maxCandidates.length}...`);

        for (const candidateUrl of maxCandidates) {
          try {
            console.log(`[CRAWLER] Deep crawling product detail candidate: ${candidateUrl}`);
            const candController = new AbortController();
            const candTimeoutId = setTimeout(() => candController.abort(), 6000);
            
            const candRes = await fetch(candidateUrl, { headers, signal: candController.signal });
            clearTimeout(candTimeoutId);

            if (candRes.ok) {
              const candHtml = await candRes.text();
              const candImages = extractImagesFromHtml(candHtml, candidateUrl);
              const bestCandImg = selectBestProductImage(candImages, designation || "", refFabricant || "", reference, brand);
              if (bestCandImg) {
                console.log(`[CRAWLER] 🌟 Deep crawler success! Found official image on candidate: ${bestCandImg}`);
                return bestCandImg;
              }
            }
          } catch (candErr: any) {
            console.info(`[CRAWLER] Deep crawling failed on candidate ${candidateUrl}: ${candErr.message}`);
          }
        }
      }

    } catch (err: any) {
      console.info(`[CRAWLER] Request failed for ${url} : ${err.message}`);
    }
  }

  return null;
}

// API endpoint for health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date() });
});

// Endpoint to automatically scrape product photo and enrich description with Gemini API + Web Search Grounding
app.post("/api/enrich-product", async (req, res) => {
  const { reference, refFabricant, marque, designation, categorie, index = 0 } = req.body;

  if (!reference) {
    return res.status(400).json({ error: "Product reference is required" });
  }

  // 1. Memory Caching layer: Return cached values immediately to eliminate duplicate API requests
  const cacheKey = `${reference}`;
  if (enrichCache.has(cacheKey)) {
    console.log(`[CACHE] 🌟 Serving cached results for reference: ${reference}`);
    return res.json(enrichCache.get(cacheKey));
  }

  const defaultDescription = `Matériel professionnel de marque ${marque || 'générique'}. Convient pour l'usage industriel intensif et répond aux normes de qualité en vigueur. Haute performance et sécurité garanties.`;
  const defaultPhoto = getCategoryFallbackImage(categorie, designation, reference, marque);

  // 1.5 Pre-emptively crawl Mabéo website search to retrieve the exact official product photo directly
  let crawledImage: string | null = null;
  try {
    console.log(`[CRAWLER] Launching pre-emptive direct search crawl on Mabéo website for reference: ${reference}`);
    crawledImage = await crawlMabeoProductImage(reference, refFabricant, marque, designation, []);
    if (crawledImage) {
      console.log(`[CRAWLER] Pre-emptive crawl success! Found official image: ${crawledImage}`);
    } else {
      console.log(`[CRAWLER] Pre-emptive crawl did not find direct image on first try, will fallback to Gemini grounding secondary scan if needed`);
    }
  } catch (crawlErr: any) {
    console.warn(`[CRAWLER] Pre-emptive crawl error for reference ${reference}:`, crawlErr.message);
  }

  try {
    // Attempt client initialization
    const ai = getGeminiClient();

    // 2. 50% Request Volume Reduction: Single unified search + structured formatting prompt
    const singlePrompt = `Tu es une IA experte de référence en matériel d'outillage, équipements de protection (EPI) et fournitures industrielles pour les professionnels de la filière B2B.

Nous préparons un catalogue de vente promotionnel et avons absolument besoin de trouver l'IMAGE réelle d'un article et ses détails :
- Référence Mabéo (Col A) : "${reference}"
- Référence Fabricant d'origine (Col F) : "${refFabricant || ''}"
- Marque (Col G) : "${marque || 'Générique'}"
- Désignation d'origine (Col B) : "${designation || ''}"

La référence d'usine fabricant ou constructeur (ex: "R.161-2P6" pour Facom, "GST-18V" pour Bosch, "AURA-9322" pour 3M, "PHEOS-CX2" pour Uvex, "QUARTZ-UP-IV" pour Delta Plus) est particulièrement critique car elle permet de retrouver directement l'article et son visuel officiel sur le web B2B !

INSTRUCTIONS DE RECHERCHE ET RECOUVRABILITÉ D'IMAGES (CRITIQUE) :
1. Recherche sur le web via Google Search en utilisant des requêtes combinant la marque et la référence fabricant, ou la référence Mabéo, par exemple :
   - "site:mabeo-industries.com ${reference} image"
   - "${marque || ''} ${refFabricant || reference || ''} image"
   - "${marque || ''} ${refFabricant || ''} photo"
   - "mabeo ${reference} ${refFabricant || ''}"
2. Analyse attentivement les résultats : recherche d'éventuelles URLs d'images absolues se terminant par .jpg, .jpeg, .png, ou contenant des chemins de serveurs type "/media/", "/images/", "/products/", "/photos/", "/cdn/".
3. Identifie également la fiche produit sur mabeo-industries.com si elle s'y trouve, et lis-en la description, le titre nettoyé et la catégorie.

RETOURNE OBLIGATOIREMENT TA RÉPONSE AU FORMAT JSON STRICT VALIDE à l'intérieur d'un bloc de code unique : \`\`\`json ... \`\`\`.
Exemple de format d'objet JSON attendu :
\`\`\`json
{
  "imageUrl": "<URL absolue propre ou à défaut \\"${defaultPhoto}\\"/ si trouvé>",
  "designationNettoyee": "<Variante propre, courte et lisible sans sigles cryptiques en français, si indisponible mette \\"${designation}\\"/ ou un titre propre>",
  "descriptionElegante": "<Une accroche commerciale attractive de 2 phrases en français rédigée de façon claire pour le catalogue promotionnel>",
  "urlProduit": "<URL absolue officielle de la fiche produit sur mabeo-industries.com si identifiée, ou à défaut \\"https://www.mabeo-industries.com/fr/recherche?q=${encodeURIComponent(refFabricant || reference)}\\"/ ouf fiche similaire>",
  "categorieEstimee": "<La catégorie trouvée ou estimée la plus proche parmi : 'Travail en hauteur', 'Manutention', 'Nettoyage Aspiration', 'Machine atelier', 'Rangement' ou à défaut \\"${categorie || 'Autres'}\\"/>"
}
\`\`\`

Ne mets absolument aucun texte en dehors du bloc \`\`\`json ... \`\`\`.`;

    // 3. Retry wrapper with exponential backoff to recover from 429 quota exhaustion
    const searchResponse = await callGeminiWithRetry(() => ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: singlePrompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    }));

    const responseText = searchResponse.text || "{}";
    const groundingUrls: string[] = [];

    // Extract grounded URLs for our custom server-side crawler
    const chunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          groundingUrls.push(chunk.web.uri);
        }
      }
    }

    // Launch our custom scraping crawler with secondary grounding URLs if no direct image was found yet
    if (!crawledImage && groundingUrls.length > 0) {
      try {
        console.log(`[CRAWLER] Launching secondary grounding page scan to supplement product image search`);
        crawledImage = await crawlMabeoProductImage(reference, refFabricant, marque, designation, groundingUrls);
      } catch (crawlErr: any) {
        console.warn("[CRAWLER] Secondary grounding scan failed", crawlErr);
      }
    }

    let data: any = null;
    try {
      // Clean parsing of JSON block inside search response text
      data = extractJsonFromText(responseText);
    } catch (parseError: any) {
      console.warn("[GEMINI] Failed to parse JSON from single call response, attempting fallback structured call", parseError.message);
      
      // Fallback formatting call ONLY if text regex parsing fails
      const formatPrompt = `Prends le texte de recherche de produit suivant et convertis-le rigoureusement en un objet JSON conforme.
Texte :
"""
${responseText}
"""`;
      
      const formatResponse = await callGeminiWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formatPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              imageUrl: { type: Type.STRING },
              designationNettoyee: { type: Type.STRING },
              descriptionElegante: { type: Type.STRING },
              urlProduit: { type: Type.STRING },
              categorieEstimee: { type: Type.STRING },
            },
            required: ["imageUrl", "designationNettoyee", "descriptionElegante"]
          }
        }
      }));
      data = JSON.parse(formatResponse.text?.trim() || "{}");
    }

    // Basic sanitization
    if (!data) data = {};
    if (!data.imageUrl || data.imageUrl.trim() === "" || !data.imageUrl.startsWith("http")) {
      data.imageUrl = defaultPhoto;
    }

    // Overwrite with our high-quality crawled Mabéo image if we successfully found one!
    if (crawledImage) {
      data.imageUrl = crawledImage;
    }

    if (!data.descriptionElegante) {
      data.descriptionElegante = defaultDescription;
    }

    if (!data.designationNettoyee) {
      data.designationNettoyee = designation || `Produit Réf. ${reference}`;
    }

    const payload = {
      success: true,
      reference,
      marque: marque || "GÉNÉRIQUE",
      designation: data.designationNettoyee,
      prix: req.body.prix || 0,
      categorie: data.categorieEstimee || categorie || "Autres",
      imageUrl: data.imageUrl,
      description: data.descriptionElegante,
      urlProduit: data.urlProduit || `https://www.mabeo-industries.com/fr/recherche?q=${encodeURIComponent(refFabricant || reference)}`,
      searchStatus: 'success'
    };

    // Cache the successful outcome
    enrichCache.set(cacheKey, payload);

    return res.json(payload);

  } catch (error: any) {
    const isQuota = error?.message && (error.message.includes("429") || error.message.includes("quota") || error.message.includes("RESOURCE_EXHAUSTED"));
    if (isQuota) {
      console.warn(`[GEMINI] 429 API Quota/Rate Limit exceeded for product ${reference}. Bypassing with elite heuristic fallback copy generator.`);
    } else {
      console.warn(`[GEMINI] Warning: Enrichment failed for product ${reference}:`, error.message);
    }
    
    // Clean and generate beautiful B2B French copy heuristically to bypass quota limits perfectly
    const fallbackDesc = buildHeuristicDescription(
      cleanPhrase(designation || ""),
      marque,
      categorie
    );
    const fallbackDesig = cleanPhrase(designation || `Produit Réf. ${reference}`);

    const finalPhoto = crawledImage || defaultPhoto;

    // Silent recovery with elegant fallback values to always guarantee visual flyer function
    const payload = {
      success: false,
      reference,
      marque: marque || "GÉNÉRIQUE",
      designation: fallbackDesig,
      prix: req.body.prix || 0,
      categorie: categorie || "Autres",
      imageUrl: finalPhoto,
      description: fallbackDesc,
      urlProduit: `https://www.mabeo-industries.com/fr/recherche?q=${encodeURIComponent(refFabricant || reference)}`,
      searchStatus: 'failed',
      error: error.message
    };

    // Store in cache even if failed to avoid repeatedly invoking Gemini under heavy quota exhaustion
    enrichCache.set(cacheKey, payload);

    return res.json(payload);
  }
});

// Resilient heuristic search fallback when quota is offline / Gemini is not available
function generateHeuristicSearchResults(query: string): any[] {
  const qStr = query.toLowerCase();
  
  const catalog = [
    {
      reference: "1482051",
      refFabricant: "1504-008",
      marque: "TUBESCA-COMABI",
      designation: "Échelle télescopique aluminium 3,80 m l'Atelier",
      prix: 289.00,
      categorie: "Travail en hauteur",
      imageUrl: "https://groupe-mb.scene7.com/is/image/groupemb/1482051?$400x400$",
      description: "Échelle télescopique de qualité professionnelle avec stabilisateurs intégrés. Aluminium haute résistance de niveau B2B."
    },
    {
      reference: "4910245",
      refFabricant: "GS-25S4",
      marque: "PRAMAC",
      designation: "Transpalette manuel robuste 2,5 Tonnes",
      prix: 399.00,
      categorie: "Manutention",
      imageUrl: "https://groupe-mb.scene7.com/is/image/groupemb/4910245?$400x400$",
      description: "Transpalette manuel avec châssis renforcé en acier soudé haute performance. Roues en polyuréthane très maniables."
    },
    {
      reference: "8829402",
      refFabricant: "NT-30-1-TL",
      marque: "KÄRCHER",
      designation: "Aspirateur eau et poussière NT 30/1 Tact L de chantier",
      prix: 485.00,
      categorie: "Nettoyage Aspiration",
      imageUrl: "https://groupe-mb.scene7.com/is/image/groupemb/8829402?$400x400$",
      description: "Aspirateur professionnel Kärcher avec décolmatage automatique du filtre Tact. Cuve robuste de 30 litres pour chantier."
    },
    {
      reference: "7012948",
      refFabricant: "ROLL.6M3",
      marque: "FACOM",
      designation: "Servante d'atelier Roll 6 tiroirs rouge robuste",
      prix: 429.00,
      categorie: "Rangement",
      imageUrl: "https://groupe-mb.scene7.com/is/image/groupemb/7012948?$400x400$",
      description: "Servante d'atelier Facom Roll robuste. Plateau de travail renforcé résistant aux solvants, sécurité anti-basculement."
    },
    {
      reference: "1192834",
      refFabricant: "7000-AURA-3M",
      marque: "3M",
      designation: "Demi-masque de protection respiratoire série 7500",
      prix: 32.50,
      categorie: "Équipements de Protection Individuelle",
      imageUrl: "https://groupe-mb.scene7.com/is/image/groupemb/1192834?$400x400$",
      description: "Demi-masque de protection 3M réutilisable avec soupape Cool Flow réduisant la résistance respiratoire et la chaleur."
    },
    {
      reference: "5512039",
      refFabricant: "Uvex-PHEOS-CX2",
      marque: "UVEX",
      designation: "Lunettes de protection Pheos CX2 incolore",
      prix: 14.90,
      categorie: "Équipements de Protection Individuelle",
      imageUrl: "https://groupe-mb.scene7.com/is/image/groupemb/5512039?$400x400$",
      description: "Lunettes de protection professionnelles à champ de vision élargi. Revêtement anti-rayures et antibuée haute performance."
    },
    {
      reference: "2609312",
      refFabricant: "GSR-18V-55",
      marque: "BOSCH",
      designation: "Perceuse visseuse sans fil GSR 18V-55 professionnelle",
      prix: 185.00,
      categorie: "Machine atelier",
      imageUrl: "https://groupe-mb.scene7.com/is/image/groupemb/2609312?$400x400$",
      description: "Perceuse visseuse Bosch Pro avec moteur sans charbon (brushless) robuste. Mandrin métallique de 13 mm haute durabilité."
    },
    {
      reference: "3601248",
      refFabricant: "R.161-6P6",
      marque: "FACOM",
      designation: "Coffret de douilles et cliquet 1/4 pouce serrage",
      prix: 159.00,
      categorie: "Outillage à Main",
      imageUrl: "https://groupe-mb.scene7.com/is/image/groupemb/3601248?$400x400$",
      description: "Coffret Facom ultra-compact comprenant cliquet étanche, douilles de 5.5 à 14 mm et embouts de vissage haute qualité."
    }
  ];

  const matches = catalog.filter(item => 
    item.designation.toLowerCase().includes(qStr) ||
    item.refFabricant.toLowerCase().includes(qStr) ||
    item.marque.toLowerCase().includes(qStr) ||
    item.reference.includes(qStr) ||
    item.categorie.toLowerCase().includes(qStr)
  );

  // If no match found, generate a few smart procedural products to satisfy user intent elegantly
  if (matches.length === 0) {
    const words = qStr.split(/\s+/).filter(w => w.length > 2);
    const resolvedName = words.length > 0 
      ? words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") 
      : "Équipement Pro Mabéo";

    return [
      {
        id: `search-fallback-1`,
        reference: `318${Math.floor(1000 + Math.random() * 9000)}`,
        refFabricant: `M-REF-${Math.floor(100 + Math.random() * 900)}`,
        marque: "MABÉO SELECTION",
        designation: `${resolvedName} Premium`,
        prix: 79.50,
        categorie: "Autres",
        imageUrl: getCategoryFallbackImage("Autres", resolvedName, "REF-AUTO"),
        description: `Matériel professionnel répondant aux exigences techniques de l'industrie. Conception de qualité supérieure, robuste et durable.`
      }
    ];
  }

  return matches.map((m, i) => ({
    ...m,
    id: `search-fallback-${i}`
  }));
}

// Search for articles on Mabéo with Google Grounding Search on Gemini
app.post("/api/search-mabeo", async (req, res) => {
  const { query } = req.body;
  
  if (!query || query.trim() === "") {
    return res.status(400).json({ error: "Recherche vide" });
  }

  console.log(`[SEARCH] Searching for articles on Mabéo matching: "${query}"`);

  try {
    const ai = getGeminiClient();
    const prompt = `Tu es une IA B2B experte de l'outillage et de la fourniture industrielle.
Recherche 4 articles industriels réels ou de matériel de marque professionnelle qui existent et correspondent à la recherche suivante : "${query}".
Nous voulons prioritairement des fiches produits de mabeo-industries.com ou de marques d'outillage ou d'EPI professionnelles de référence (comme Facom, Bosch, 3M, Karcher, Uvex, Delta Plus, Tubesca-Comabi, Pramac, etc.).

Pour chaque article, trouve ou estime avec précision :
1. "reference" : Une référence Mabéo numérique ou alphanumérique réaliste (par exemple 7 chiffres comme 1482051, 4910245, etc.) ou trouve la vraie référence de l'article de Mabéo.
2. "refFabricant" : La référence d'origine fabricant (obligatoire et très précise, ex: "R.161-2P6", "GS-25S4").
3. "marque" : La marque authentique du produit (UPPERCASE, ex: "FACOM", "BOSCH").
4. "designation" : La désignation commerciale propre en français, nettoyée (sans abréviations cryptiques).
5. "prix" : Un prix H.T. réaliste en euros (ex: 85.50 ou 145.00). S'il s'agit d'une machine d'exception sans prix, mets "Sur devis".
6. "categorie" : La catégorie la plus appropriée exclusivement parmi : 'Travail en hauteur', 'Manutention', 'Nettoyage Aspiration', 'Machine atelier', 'Rangement', 'Équipements de Protection Individuelle', 'Outillage à Main', 'Autres'.
7. "imageUrl" : Une URL d'image en ligne de qualité pour illustrer le produit (idéalement de type Scene7 sur groupe-mb.scene7.com ou de l'image officielle).
8. "description" : Une description commerciale attractive de 1 ou 2 phrases en français rédigée de façon claire pour un catalogue pro.

Retourne OBLIGATOIREMENT ta réponse sous forme de tableau d'objets JSON strict à l'intérieur d'un bloc de code unique : \`\`\`json ... \`\`\`.
Exemple de format attendu :
\`\`\`json
[
  {
    "reference": "1482051",
    "refFabricant": "1504-008",
    "marque": "TUBESCA-COMABI",
    "designation": "Échelle télescopique aluminium 3,80 m",
    "prix": 289.00,
    "categorie": "Travail en hauteur",
    "imageUrl": "https://groupe-mb.scene7.com/is/image/groupemb/1482051?$400x400$",
    "description": "Échelle télescopique robuste et stable conçue pour un usage professionnel intensif."
  }
]
\`\`\`

Ne mets absolument aucun texte en dehors du bloc \`\`\`json ... \`\`\`.`;

    const searchResponse = await callGeminiWithRetry(() => ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    }));

    const responseText = searchResponse.text || "[]";
    let results = [];
    try {
      results = extractJsonFromText(responseText);
    } catch (parseErr) {
      console.warn("[SEARCH] Failed to parse JSON, falling back to schema structured prompt");
      
      const formatPrompt = `Prends le texte de recherche de produit suivant et convertis-le rigoureusement en un tableau d'objets JSON.
Texte :
"""
${responseText}
"""`;
      
      const formatResponse = await callGeminiWithRetry(() => ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formatPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reference: { type: Type.STRING },
                refFabricant: { type: Type.STRING },
                marque: { type: Type.STRING },
                designation: { type: Type.STRING },
                prix: { type: Type.STRING },
                categorie: { type: Type.STRING },
                imageUrl: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["reference", "marque", "designation", "prix", "categorie"]
            }
          }
        }
      }));
      results = JSON.parse(formatResponse.text?.trim() || "[]");
    }

    if (!Array.isArray(results)) {
      results = [];
    }

    results = results.map((item: any) => {
      if (!item.imageUrl || item.imageUrl.trim() === "" || !item.imageUrl.startsWith("http")) {
        item.imageUrl = getCategoryFallbackImage(item.categorie, item.designation, item.reference, item.marque);
      }
      return {
        ...item,
        id: `search-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        searchStatus: 'success'
      };
    });

    console.log(`[SEARCH] Successfully found ${results.length} articles matching "${query}"`);
    return res.json({ success: true, results });

  } catch (err: any) {
    console.error(`[SEARCH] Gemini search failed for query "${query}":`, err.message);
    
    return res.json({
      success: false,
      error: err.message,
      results: generateHeuristicSearchResults(query).map(item => ({
        ...item,
        id: `search-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      }))
    });
  }
});


async function boot() {
  // Vite integration in development mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode.`);
  });
}

boot().catch((err) => {
  console.error("Failed to start server:", err);
});
