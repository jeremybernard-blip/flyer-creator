/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  reference: string;
  refFabricant?: string;
  marque: string;
  designation: string;
  prix: number | string;
  categorie: string;
  imageUrl?: string;
  description?: string;
  searchStatus?: 'idle' | 'searching' | 'success' | 'failed';
}

export interface MergedProduct {
  id: string;
  marque: string;
  categorie: string;
  imageUrl: string;
  description: string;
  commonDesignation: string;
  variants: {
    id?: string;
    reference: string;
    refFabricant?: string;
    designation: string;
    prix: number | string;
  }[];
}

export interface FlyerConfig {
  title: string;
  subtitle: string;
  date: string;
  brandColor: string; // hex color selector
  headerText: string;
  footerText: string;
  showCover: boolean;
  sortByMarque: boolean;
  groupByCategory: boolean;
  companyLogoUrl?: string;
}

declare global {
  interface Window {
    html2pdf: any;
  }
}
