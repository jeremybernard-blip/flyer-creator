import React, { useState } from 'react';
import { Product } from '../types';
import { 
  Play, Sparkles, Plus, Trash2, Edit2, CheckCircle2, 
  X, AlertTriangle, Eye, RefreshCw, FileText, Check, Search, Image as ImageIcon
} from 'lucide-react';

interface ProductEditorProps {
  products: Product[];
  onAddProduct: (p: Product) => void;
  onUpdateProduct: (id: string, updates: Partial<Product>) => void;
  onDeleteProduct: (id: string) => void;
  onBatchScrape: () => void;
  onSingleScrape: (id: string) => void;
  isScrapingBatch: boolean;
  scrapeProgress: { current: number; total: number };
  scrapeDelay: number;
  setScrapeDelay: (ms: number) => void;
  initialEditingId?: string | null;
  onClearInitialEditingId?: () => void;
}

export function ProductEditor({ 
  products, 
  onAddProduct, 
  onUpdateProduct, 
  onDeleteProduct,
  onBatchScrape,
  onSingleScrape,
  isScrapingBatch,
  scrapeProgress,
  scrapeDelay,
  setScrapeDelay,
  initialEditingId,
  onClearInitialEditingId
}: ProductEditorProps) {
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formRefFabricant, setFormRefFabricant] = useState('');

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearchMabeo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/search-mabeo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      if (data.success || data.results) {
        setSearchResults(data.results || []);
      } else {
        setSearchError(data.error || "Une erreur est survenue lors de la recherche.");
      }
    } catch (err: any) {
      setSearchError("Impossible de joindre le serveur pour effectuer la recherche.");
    } finally {
      setSearchLoading(false);
    }
  };

  // Form states
  const [formRef, setFormRef] = useState('');
  const [formMarque, setFormMarque] = useState('');
  const [formDesig, setFormDesig] = useState('');
  const [formPrix, setFormPrix] = useState<number | string>('');
  const [formCat, setFormCat] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formImg, setFormImg] = useState('');

  const resetForm = () => {
    setFormRef('');
    setFormRefFabricant('');
    setFormMarque('');
    setFormDesig('');
    setFormPrix('');
    setFormCat('Travail en hauteur');
    setFormDesc('');
    setFormImg('');
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef || !formDesig) return;

    const newProd: Product = {
      id: `manual-${Date.now()}`,
      reference: formRef.trim(),
      refFabricant: formRefFabricant.trim() || undefined,
      marque: (formMarque.trim() || 'GÉNÉRIQUE').toUpperCase(),
      designation: formDesig.trim(),
      prix: formPrix === '' ? '' : Number(formPrix),
      categorie: formCat.trim() || 'Fournitures Générales',
      description: formDesc.trim() || undefined,
      imageUrl: formImg.trim() || undefined,
      searchStatus: 'idle'
    };

    onAddProduct(newProd);
    resetForm();
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setFormRef(p.reference);
    setFormRefFabricant(p.refFabricant || '');
    setFormMarque(p.marque);
    setFormDesig(p.designation);
    setFormPrix(p.prix);
    setFormCat(p.categorie);
    setFormDesc(p.description || '');
    setFormImg(p.imageUrl || '');
    setShowAddForm(true);
  };

  React.useEffect(() => {
    if (initialEditingId) {
      const match = products.find(p => p.id === initialEditingId);
      if (match) {
        startEdit(match);
        setTimeout(() => {
          const element = document.getElementById('sheet-table-wrapper') || document.getElementById('spreadsheet-table');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
      if (onClearInitialEditingId) {
        onClearInitialEditingId();
      }
    }
  }, [initialEditingId, products, onClearInitialEditingId]);

  const handleUpdateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    onUpdateProduct(editingId, {
      reference: formRef.trim(),
      refFabricant: formRefFabricant.trim() || undefined,
      marque: (formMarque.trim() || 'GÉNÉRIQUE').toUpperCase(),
      designation: formDesig.trim(),
      prix: formPrix === '' ? '' : Number(formPrix),
      categorie: formCat.trim() || 'Fournitures Générales',
      description: formDesc.trim() || undefined,
      imageUrl: formImg.trim() || undefined,
    });

    resetForm();
  };

  return (
    <div id="product-editor-layout" className="flex flex-col gap-5">
      
      {/* Search / Action bar */}
      <div id="editor-actions" className="flex flex-wrap items-center justify-between gap-4 p-5 glass-card text-white rounded-xl">
        <div>
          <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
            ⚙️ Gestionnaire de Produit
            <span className="text-xs bg-white/5 text-blue-300 py-0.5 px-2 rounded-md font-mono border border-white/10 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
              {products.length} articles
            </span>
          </h3>
          <p className="text-xs text-slate-350 mt-1">
            Visualisez les données Excel extraites, modifiez-les ou lancez l'illustration automatisée par web scraping.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Scraping Pacing / Speed Selection */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1 text-[11px] h-9">
            <span className="text-slate-400 font-medium px-2 shrink-0">Pacing (Anti-429) :</span>
            <button
              type="button"
              onClick={() => !isScrapingBatch && setScrapeDelay(5000)}
              disabled={isScrapingBatch}
              className={`px-2 py-1 rounded transition-all cursor-pointer ${
                scrapeDelay === 5000 
                  ? 'bg-blue-600 font-bold text-white' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Super Sûr (5s) : Intervalle long recommandé pour éviter absolument les 429 quota"
            >
              Sécurisé (5s)
            </button>
            <button
              type="button"
              onClick={() => !isScrapingBatch && setScrapeDelay(3000)}
              disabled={isScrapingBatch}
              className={`px-2 py-1 rounded transition-all cursor-pointer ${
                scrapeDelay === 3000 
                  ? 'bg-blue-600 font-bold text-white' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Standard sécurisé (3s) : Meilleur compromis"
            >
              Standard (3s)
            </button>
            <button
              type="button"
              onClick={() => !isScrapingBatch && setScrapeDelay(1000)}
              disabled={isScrapingBatch}
              className={`px-2 py-1 rounded transition-all cursor-pointer ${
                scrapeDelay === 1000 
                  ? 'bg-orange-600/60 font-bold text-white shadow-sm' 
                  : 'text-slate-400 hover:text-orange-300 hover:bg-white/5'
              }  disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Rapide (1s) : Plus rapide mais risque plus élevé de quota épuisé"
            >
              Rapide (1s)
            </button>
          </div>

          <button
            type="button"
            id="btn-trigger-add"
            onClick={() => { resetForm(); setShowAddForm(true); }}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs font-semibold py-2 px-3.5 h-9 rounded-lg cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4 text-blue-400" />
            Créer un article
          </button>
          
          <button
            type="button"
            id="btn-trigger-scrape"
            onClick={onBatchScrape}
            disabled={isScrapingBatch || products.length === 0}
            className={`flex items-center gap-1.5 text-xs font-bold py-2 px-4.5 h-9 rounded-full cursor-pointer transition-all shadow-lg ${
              isScrapingBatch
                ? 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-102 shadow-blue-500/20 hover:shadow-blue-500/30'
            }`}
          >
            {isScrapingBatch ? (
              <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-white" />
            )}
            {isScrapingBatch ? `Recherche (En cours...)` : "Lancer Scraping / Illustration"}
          </button>
        </div>
      </div>

      {/* Scraping Batch status panel */}
      {isScrapingBatch && (
        <div id="batch-progress-card" className="p-4 bg-blue-500/10 text-blue-200 rounded-xl border border-blue-500/20 shadow-md flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
              Récupération des photos Mabeo Industries & Enrichissement Gemini...
            </span>
            <span className="font-mono text-blue-300">{scrapeProgress.current} / {scrapeProgress.total}</span>
          </div>
          <div className="h-1.5 w-full bg-slate-900/50 rounded-full overflow-hidden border border-white/5">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.6)]" 
              style={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-blue-400 mt-1 leading-relaxed">
            Pacing de sécurité actif : <strong>{(scrapeDelay / 1000).toFixed(1)} secondes</strong> de délai entre chaque produit pour contourner les quotas limites de requêtes Gemini (429 / RESOURCE_EXHAUSTED). Si les quotas journaliers gratuits de l'API sont dépassés, le système prend intelligemment le relais avec les <strong>fiches de secours locales d'atelier</strong> afin de garantir un catalogue élégant et sans blocages.
          </p>
        </div>
      )}

      {/* Article Search Tool */}
      <div id="mabeo-article-search-card" className="p-5 glass-card shadow-lg rounded-xl text-white">
        <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 mb-2">
          <Search className="w-4 h-4 text-blue-400" />
          Rechercher un Article Mabéo (Spécification intelligente)
        </h4>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed font-normal">
          Saisissez des mots-clés ou un équipement (ex : <em className="text-blue-300 font-semibold not-italic">gants uvex, servante facom, karcher nt 30, harnais tubesca</em>) pour chercher directement les fiches correspondantes complètes, avec leurs photos et prix d'origine.
        </p>

        <form onSubmit={handleSearchMabeo} className="flex gap-2.5">
          <div className="relative flex-1 text-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Saisissez votre équipement ou produit..."
              className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 pl-3 text-xs text-white focus:outline-none focus:border-blue-500 shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={searchLoading}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-5 rounded-lg text-xs flex items-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:pointer-events-none cursor-pointer shrink-0 shadow-lg shadow-blue-500/15"
          >
            {searchLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
            ) : (
              <Search className="w-3.5 h-3.5 text-white" />
            )}
            {searchLoading ? "Recherche..." : "Rechercher"}
          </button>
        </form>

        {searchError && (
          <div className="mt-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Search Results Display */}
        {searchResults.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4 animate-fadeIn">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[11px] font-bold text-slate-350 uppercase tracking-wider">Résultats du catalogue ({searchResults.length})</span>
              <button
                type="button"
                onClick={() => setSearchResults([])}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Masquer
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchResults.map((result, idx) => {
                const alreadyAdded = products.some(p => p.reference === result.reference);
                return (
                  <div key={result.id || idx} className="bg-slate-900/60 border border-white/5 rounded-xl p-3 flex gap-3 items-stretch hover:border-blue-500/20 transition-all shadow-md group">
                    {/* Image Thumbnail */}
                    <div className="w-16 h-16 rounded-lg bg-white/5 p-1 flex items-center justify-center shrink-0 border border-white/10 overflow-hidden relative group-hover:border-blue-500/30 transition-colors">
                      {result.imageUrl ? (
                        <img 
                          src={result.imageUrl} 
                          alt={result.designation} 
                          className="w-full h-full object-contain mix-blend-normal rounded" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-500" />
                      )}
                    </div>
                    {/* Details */}
                    <div className="flex-1 flex flex-col justify-between text-xs min-w-0">
                      <div>
                        <div className="flex justify-between items-start gap-1">
                          <span className="bg-blue-500/10 text-blue-300 font-black text-[9px] px-2 py-0.5 rounded uppercase tracking-wider border border-blue-500/15 truncate max-w-[120px]" title={result.marque}>
                            {result.marque}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 font-bold block">Réf: {result.reference}</span>
                        </div>
                        <h5 className="font-bold text-slate-100 truncate mt-1.5" title={result.designation}>{result.designation}</h5>
                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5" title={result.description}>{result.description}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-white/5">
                        <span className="text-amber-400 font-bold font-mono">
                          {typeof result.prix === 'number' ? `${result.prix.toFixed(2)} € HT` : result.prix}
                        </span>
                        
                        <button
                          type="button"
                          onClick={() => {
                            onAddProduct({
                              ...result,
                              id: `manual-${Date.now()}-${idx}`
                            });
                          }}
                          disabled={alreadyAdded}
                          className={`py-1 px-3 rounded-full text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            alreadyAdded 
                              ? 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/10'
                          }`}
                        >
                          {alreadyAdded ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              Ajouté
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3 text-white" />
                              Ajouter
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Editor/Add dialog form */}
      {showAddForm && (
        <div id="product-form-card" className="p-5 glass-card shadow-xl rounded-xl text-white">
          <div className="flex justify-between items-center pb-3 border-b border-white/10 mb-4 bg-white/5 -mx-5 -mt-5 p-4 rounded-t-xl">
            <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
              {editingId ? <Edit2 className="w-4 h-4 text-blue-400" /> : <Plus className="w-4 h-4 text-blue-400" />}
              {editingId ? "Modifier l'article" : "Créer un nouvel article"}
            </h4>
            <button
              id="close-form-btn"
              type="button"
              onClick={resetForm}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={editingId ? handleUpdateProduct : handleCreateProduct} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-300">
            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300">Référence Mabéo (Col A) *</label>
              <input
                type="text"
                required
                value={formRef}
                onChange={(e) => setFormRef(e.target.value)}
                placeholder="ex. 1294812"
                className="glass-input rounded-lg p-2 font-mono text-xs focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300">Référence Fabricant (Col F)</label>
              <input
                type="text"
                value={formRefFabricant}
                onChange={(e) => setFormRefFabricant(e.target.value)}
                placeholder="ex. R.161-2P6"
                className="glass-input rounded-lg p-2 font-mono text-xs focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-slate-300">Marque (Col G) *</label>
              <input
                type="text"
                required
                value={formMarque}
                onChange={(e) => setFormMarque(e.target.value)}
                placeholder="ex. FACOM, BOSCH, 3M"
                className="glass-input rounded-lg p-2 text-xs focus:outline-none uppercase"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-slate-300">Désignation commerciale *</label>
              <input
                type="text"
                required
                value={formDesig}
                onChange={(e) => setFormDesig(e.target.value)}
                placeholder="ex. Jeu de 9 clés mâles coudées torx"
                className="glass-input rounded-lg p-2 text-xs focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300">Prix de vente H.T. (€) (Optionnel)</label>
              <input
                type="text"
                value={formPrix}
                onChange={(e) => setFormPrix(e.target.value)}
                placeholder="ex. 42.50"
                className="glass-input rounded-lg p-2 text-xs focus:outline-none font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-slate-300">Catégorie de produit</label>
              <select
                value={formCat}
                onChange={(e) => setFormCat(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Travail en hauteur" className="bg-slate-900 text-white">Travail en hauteur</option>
                <option value="Manutention" className="bg-slate-900 text-white">Manutention</option>
                <option value="Nettoyage Aspiration" className="bg-slate-900 text-white">Nettoyage Aspiration</option>
                <option value="Machine atelier" className="bg-slate-900 text-white">Machine atelier</option>
                <option value="Rangement" className="bg-slate-900 text-white">Rangement & Servantes</option>
                <option value="Équipements de Protection Individuelle" className="bg-slate-900 text-white">Équipements de Protection Individuelle (EPI)</option>
                <option value="Outillage à Main" className="bg-slate-900 text-white">Outillage à Main</option>
                <option value="Autres" className="bg-slate-900 text-white">Autres catégories</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-slate-300">Description commerciale (Générée automatiquement si vide)</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
                placeholder="Description détaillée du produit qui s'affichera sur la fiche du flyer."
                className="glass-input rounded-lg p-2 text-xs focus:outline-none resize-none animate-none"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-slate-300 font-semibold">Lien direct de l'image de produit (Optionnel)</label>
              <input
                type="text"
                value={formImg}
                onChange={(e) => setFormImg(e.target.value)}
                placeholder="ex. https://mabeo-industries.com/images/produit.jpg"
                className="glass-input rounded-lg p-2 text-xs focus:outline-none font-mono"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                id="btn-cancel-edit"
                onClick={resetForm}
                className="bg-white/5 hover:bg-white/10 text-slate-350 border border-white/5 text-xs font-semibold py-2 px-4 rounded-lg cursor-pointer transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                id="btn-save-edit"
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-5 rounded-full cursor-pointer transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
              >
                {editingId ? "Sauvegarder" : "Créer le produit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Spreadsheet grid editor */}
      <div id="sheet-table-wrapper" className="glass-card rounded-xl overflow-hidden text-white">
        <div className="overflow-auto max-h-[550px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <table id="spreadsheet-table" className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[#0f172a] z-10 shadow-md">
              <tr className="bg-white/5 border-b border-white/15 text-slate-300 font-bold">
                <th className="p-3">Référence Mabéo (Col A)</th>
                <th className="p-3">Réf. Fabricant (Col F)</th>
                <th className="p-3">Marque (Col G)</th>
                <th className="p-3">Désignation (Col B)</th>
                <th className="p-3">Catégorie</th>
                <th className="p-3">Prix H.T.</th>
                <th className="p-3">Statut Scraping</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400">
                    <p className="font-semibold text-slate-300">Aucun produit dans la table d'édition.</p>
                    <p className="text-[11px] text-slate-450 mt-1">Glissez un fichier Excel ci-dessus ou importez des produits de démo.</p>
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  return (
                    <tr 
                       key={p.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors last:border-b-0"
                    >
                      <td className="p-3 font-mono font-bold text-slate-100">{p.reference}</td>
                      <td className="p-3 font-mono text-slate-350">{p.refFabricant || <span className="text-slate-600 font-sans italic">non spécifié</span>}</td>
                      <td className="p-3">
                        <span className="bg-blue-500/10 text-blue-300 font-bold tracking-tight rounded-md px-2 py-0.5 border border-blue-500/20 font-sans text-[10px]">
                          {p.marque}
                        </span>
                      </td>
                      <td className="p-3 font-normal text-slate-200 truncate max-w-[200px]" title={p.designation}>{p.designation}</td>
                      <td className="p-3 text-slate-300">
                        <span className="text-[11px] opacity-80">{p.categorie}</span>
                      </td>
                      <td className="p-3 font-bold font-mono text-slate-100">{typeof p.prix === 'number' ? `${p.prix.toFixed(2)} €` : p.prix || 'Sur devis'}</td>
                      
                      {/* Search Status Badge bar */}
                      <td className="p-3">
                        {p.searchStatus === 'idle' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 text-slate-400 border border-white/5 leading-none text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                            Non illustré
                          </span>
                        )}
                        {p.searchStatus === 'searching' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/15 text-blue-300 border border-blue-500/20 leading-none font-bold animate-pulse text-[10px]">
                            <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                            Scraping...
                          </span>
                        )}
                        {p.searchStatus === 'success' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 leading-none font-bold text-[10px]" title={p.imageUrl}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Illustré
                          </span>
                        )}
                        {p.searchStatus === 'failed' && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 leading-none font-bold text-[10px]" title={p.description}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            OK!
                          </span>
                        )}
                      </td>

                      {/* Row actions */}
                      <td className="p-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => onSingleScrape(p.id)}
                            disabled={isScrapingBatch}
                            title="Rechercher spécifiquement cette image"
                            className="p-1 px-1.5 hover:bg-blue-500/20 rounded border border-white/10 hover:border-blue-500/30 hover:text-blue-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-slate-400"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            title="Éditer la ligne"
                            className="p-1 px-1.5 hover:bg-white/10 hover:text-white rounded border border-white/10 transition-colors cursor-pointer text-slate-400"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteProduct(p.id)}
                            title="Supprimer la ligne"
                            className="p-1 px-1.5 hover:bg-rose-500/20 text-rose-400 rounded border border-white/10 hover:border-rose-500/30 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
