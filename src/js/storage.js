// En modo privado y con las cookies bloqueadas, localStorage existe pero tira
// al tocarlo. Ninguna preferencia de aca vale como para romper la pagina.

export const readSetting = (key) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

export const saveSetting = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch {}
};
