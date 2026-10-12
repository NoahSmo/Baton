import { createContext, useContext } from 'react'
import { DICTS, type Dict, type Lang } from '../../shared/i18n'

export const LangContext = createContext<Lang>('en')

export function useLang(): Lang {
  return useContext(LangContext)
}

/** Strings of the language currently selected in the app. */
export function useT(): Dict {
  return DICTS[useContext(LangContext)]
}
