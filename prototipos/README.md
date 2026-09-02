# Prototipos · Control Position

Carpeta de prototipos navegables para revisar en equipo. No hay paso de compilación:
el navegador traduce el JSX en caliente con Babel standalone y las librerías llegan
por CDN, igual que el prototipo del Sprint 1.

## Publicar

1. Copiá la carpeta `prototipos/` a la raíz de la rama `gh-pages` del repo
   `strangerboxx/MVP-prototipo-cp`.
2. Commit y push.
3. En un par de minutos queda en:
   `https://strangerboxx.github.io/MVP-prototipo-cp/prototipos/`

Ese es el link que compartís. La página lista todas las versiones y cada una abre
en pantalla completa.

## Agregar una versión nueva

Dos archivos y una línea:

1. Guardá el `.jsx` en `hu-XX-nombre/app/`.
2. Copiá una de las páginas `.html` existentes y cambiá el `src` del último
   `<script>` para que apunte a tu archivo.
3. Sumá una entrada al array `VERSIONES` al final de `index.html`.

Las versiones viejas quedan donde están. Nunca sobrescribas un archivo publicado:
si cambia el diseño, subí `v2-...` y dejá `v1-...` en línea con estado `archivada`.
Poder abrir la v1 al lado de la v2 es medio punto de la revisión.

## Estructura

```
prototipos/
  index.html                    galería de versiones (editá el array VERSIONES)
  hu-12-dashboard/
    v2-dashboard-analisis.html  página que carga el prototipo (aprobada)
    v1-B-por-dominio.html       archivada
    v1-C-evolucion-comparada.html  archivada
    app/
      v2-dashboard.jsx          el prototipo en sí
      v1-B.jsx
      v1-C.jsx
```

## Regenerar un prototipo con Claude

Los `.jsx` de esta carpeta empiezan con un preámbulo que toma React, Recharts y
Lucide desde variables globales, porque no hay bundler. Cuando le pidas a Claude
que regenere una variante, pegá el archivo completo y aclarale:

> Mantené el preámbulo de globales y el bloque de montaje del final. No agregues
> sentencias `import`.

Para el dashboard HU-12, cambiar el set de indicadores es editar sólo el array
`INDICADORES`. Conectar datos reales es reemplazar el cuerpo de
`obtenerSerie(indicadorId, rango, filtros)` y poner `USANDO_DATOS_REALES = true`.

## Probar en local

Abrir el HTML con doble clic no siempre funciona, porque el navegador bloquea la
carga del `.jsx` desde `file://`. Levantá un servidor:

```bash
cd prototipos
python3 -m http.server 8000
```

Y entrá a `http://localhost:8000`.

## Dependencias externas

Todo viene de CDN, así que los prototipos necesitan internet para abrir:
React 18.3.1, Recharts 2.12.7, Lucide 0.383.0, Babel standalone 7.29.0,
Tailwind (Play CDN) e IBM Plex Sans desde Google Fonts.
