import { useCallback } from 'react';

function getParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function setParams(params: URLSearchParams) {
  const qs = params.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export function useQueryParam(key: string, defaultValue: string): [string, (val: string) => void] {
  const params = getParams();
  const value = params.get(key) ?? defaultValue;

  const setValue = useCallback(
    (val: string) => {
      const p = getParams();
      if (val === defaultValue) {
        p.delete(key);
      } else {
        p.set(key, val);
      }
      setParams(p);
    },
    [key, defaultValue],
  );

  return [value, setValue];
}
