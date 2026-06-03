import React from 'react';
import { Settings, Eye, Layout, Palette, FileText, Check } from 'lucide-react';
import { FlyerConfig } from '../types';

interface FlyerSettingsPanelProps {
  config: FlyerConfig;
  onChange: (updater: Partial<FlyerConfig>) => void;
}

const PRESET_COLORS = [
  { name: 'Jaune Chantier', hex: '#eab308' }, // Amber/Yellow
  { name: 'Bleu Pro', hex: '#3b82f6' }, // Blue
  { name: 'Rouge Outillage', hex: '#ef4444' }, // Red
  { name: 'Vert Sécurité', hex: '#10b981' }, // Green
  { name: 'Gris Sidérurgie', hex: '#94a3b8' }, // Gray
  { name: 'Pure Onyx', hex: '#1e293b' } // Slate
];

export function FlyerSettingsPanel({ config, onChange }: FlyerSettingsPanelProps) {
  return (
    <div id="settings-panel" className="glass-card rounded-xl p-6 flex flex-col gap-6 text-white">
      <div id="settings-header" className="flex items-center gap-2 pb-4 border-b border-white/10">
        <Settings className="w-5 h-5 text-blue-400" />
        <h3 id="settings-title" className="font-bold text-white text-base">Configuration Visuelle</h3>
      </div>

      {/* Form Fields Group */}
      <div id="settings-sections" className="flex flex-col gap-5 text-xs">
        
        {/* Texts Category */}
        <div id="settings-text-fields" className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-400">
            <FileText className="w-4 h-4 text-blue-400" />
            <span>Textes & En-têtes</span>
          </div>

          <div id="field-titre-group" className="flex flex-col gap-1.5">
            <label id="lbl-title" className="text-slate-300 font-semibold">Titre du Flyer</label>
            <input
              type="text"
              value={config.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="e.g., CAMPAGNE OUTILLAGE DE PRINTEMPS"
            />
          </div>

          <div id="field-subtitle-group" className="flex flex-col gap-1.5">
            <label id="lbl-subtitle" className="text-slate-300 font-semibold">Sous-titre / Accroche</label>
            <input
              type="text"
              value={config.subtitle}
              onChange={(e) => onChange({ subtitle: e.target.value })}
              className="w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="e.g., Les meilleures références de l'industrie"
            />
          </div>

          <div id="field-dates-group" className="flex flex-col gap-1.5">
            <label id="lbl-date" className="text-slate-300 font-semibold">Date et Validité</label>
            <input
              type="text"
              value={config.date}
              onChange={(e) => onChange({ date: e.target.value })}
              className="w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="e.g., Offre valable du 1er Juin au 31 Juillet 2026"
            />
          </div>

          <div id="field-headertext-group" className="flex flex-col gap-1.5">
            <label id="lbl-header" className="text-slate-300 font-semibold">En-tête de page (Haut)</label>
            <input
              type="text"
              value={config.headerText}
              onChange={(e) => onChange({ headerText: e.target.value })}
              className="w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="e.g., SELECTION EXCLUSIVE - MABEO INDUSTRIES"
            />
          </div>

          <div id="field-footertext-group" className="flex flex-col gap-1.5">
            <label id="lbl-footer" className="text-slate-300 font-semibold">Texte d'avertissement / Pied de page (Bas)</label>
            <textarea
              value={config.footerText}
              onChange={(e) => onChange({ footerText: e.target.value })}
              rows={2}
              className="w-full glass-input rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
              placeholder="e.g., Prix nets H.T. valables jusqu'à épuisement des stocks. Photos non contractuelles."
            />
          </div>
        </div>

        {/* Brand visual identity Category */}
        <div id="settings-visual" className="flex flex-col gap-3 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-400">
            <Palette className="w-4 h-4 text-blue-400" />
            <span>Identité Visuelle</span>
          </div>

          <div id="visual-colors" className="flex flex-col gap-2">
            <label id="lbl-color-accent" className="text-slate-300 font-semibold">Couleur d'accentuation</label>
            <div id="preset-colors-row" className="grid grid-cols-3 gap-2">
              {PRESET_COLORS.map((color) => {
                const isActive = config.brandColor.toLowerCase() === color.hex.toLowerCase();
                return (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => onChange({ brandColor: color.hex })}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-semibold transition-all text-left cursor-pointer ${
                      isActive
                        ? 'border-blue-500 bg-blue-500/15 text-white shadow-3xs'
                        : 'border-white/5 bg-white/5 text-slate-350 hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border border-black/20"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="truncate">{color.name.split(' ')[0]}</span>
                    {isActive && <Check className="w-3 h-3 ml-auto text-blue-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Custom hex picker */}
            <div id="custom-color-picker" className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={config.brandColor}
                onChange={(e) => onChange({ brandColor: e.target.value })}
                className="w-7 h-7 rounded border border-white/10 cursor-pointer overflow-hidden p-0 bg-transparent"
              />
              <input
                type="text"
                value={config.brandColor}
                onChange={(e) => onChange({ brandColor: e.target.value })}
                className="font-mono text-xs uppercase bg-white/5 border border-white/10 px-2 py-1 rounded-md w-24 text-center text-white focus:outline-none"
              />
              <span className="text-[10px] text-slate-450">Couleur hexadécimale personnalisée</span>
            </div>
          </div>
        </div>

        {/* Structure and templates category */}
        <div id="settings-structure" className="flex flex-col gap-3 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-400">
            <Layout className="w-4 h-4 text-blue-400" />
            <span>Structure & Gabarit</span>
          </div>

          <div id="structural-options" className="flex flex-col gap-3 text-xs font-semibold">
            {/* Show cover image switch */}
            <label id="lbl-show-cover" className="flex items-center gap-3 p-2.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 cursor-pointer transition-colors text-white">
              <input
                type="checkbox"
                checked={config.showCover}
                onChange={(e) => onChange({ showCover: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 text-blue-600 focus:ring-blue-500 bg-black/20 shrink-0 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-slate-200">Générer une page de couverture</span>
                <span className="text-[10px] text-slate-400 font-normal">Ajoute un feuillet de garde professionnel de style Catalogue</span>
              </div>
            </label>

            {/* Group by category secondary toggle */}
            <label id="lbl-group-contrib" className="flex items-center gap-3 p-2.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 cursor-pointer transition-colors text-white">
              <input
                type="checkbox"
                checked={config.groupByCategory}
                onChange={(e) => onChange({ groupByCategory: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 text-blue-600 focus:ring-blue-500 bg-black/20 shrink-0 cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-slate-200">Sous-grouper par Catégorie Produit</span>
                <span className="text-[10px] text-slate-400 font-normal">Ajoute des cloisons supplémentaires dans le document</span>
              </div>
            </label>

            {/* Logo option input */}
            <div id="logo-setting-group" className="flex flex-col gap-1.5 pt-1.5">
              <label className="text-slate-300 font-semibold">URL du Logo d'Entreprise alternatif</label>
              <input
                type="text"
                value={config.companyLogoUrl || ''}
                onChange={(e) => onChange({ companyLogoUrl: e.target.value })}
                className="w-full glass-input rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                placeholder="https://ex.com/logo.png"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
