// Store for managing error detection and AI fix suggestions

import { create } from 'zustand';
import type { CommandError } from '../utils/errorDetection';

interface ErrorState {
  lastError: CommandError | null;
  showFixButton: boolean;
  isLoadingFix: boolean;
  suggestedFix: string | null;
  
  setError: (error: CommandError) => void;
  clearError: () => void;
  setShowFixButton: (show: boolean) => void;
  setSuggestedFix: (fix: string) => void;
  setLoadingFix: (loading: boolean) => void;
}

export const useErrorStore = create<ErrorState>((set) => ({
  lastError: null,
  showFixButton: false,
  isLoadingFix: false,
  suggestedFix: null,
  
  setError: (error) => set({ 
    lastError: error, 
    showFixButton: true,
    suggestedFix: null 
  }),
  
  clearError: () => set({ 
    lastError: null, 
    showFixButton: false,
    suggestedFix: null 
  }),
  
  setShowFixButton: (show) => set({ showFixButton: show }),
  setSuggestedFix: (fix) => set({ suggestedFix: fix }),
  setLoadingFix: (loading) => set({ isLoadingFix: loading }),
}));
