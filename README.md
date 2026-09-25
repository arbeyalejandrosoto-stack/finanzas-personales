# Mis Finanzas

Aplicación web (PWA instalable) para control de finanzas personales: ingresos, gastos, presupuestos, deudas y ahorro. Los datos se guardan en la nube por usuario con [Supabase](https://supabase.com).

## Uso

Sirve la carpeta con cualquier servidor estático y abre la URL en el navegador:

```bash
npx serve .        # o: python3 -m http.server
```

Crea una cuenta con correo y contraseña. La app puede instalarse desde el navegador ("Instalar app" / "Agregar a pantalla de inicio").

> El service worker requiere `https` o `localhost`. Abrir `index.html` como archivo (`file://`) no permite instalarla.

## Características

- **Resumen**: balance total, KPIs del mes con variación vs. mes anterior, gráfica de ingresos vs. gastos (últimos 6 meses), gastos por categoría y estado de presupuestos con alertas.
- **Transacciones**: registro de ingresos y gastos, historial filtrable y **transacciones recurrentes** (semanal, quincenal, mensual, anual) que se registran solas.
- **Presupuestos**: límite mensual por categoría de gasto; alerta al llegar al 80% y al superarlo.
- **Deudas**: deudas propias y de terceros, con abonos parciales.
- **Ahorro**: metas con aportes y barra de progreso.
- **Ajustes**: moneda, color de acento, tema claro/oscuro, categorías personalizadas (emoji y color), exportar/importar JSON y borrar datos.

## Arquitectura

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Cliente Supabase | `js/supabaseClient.js` | URL y clave pública (`anon`) del proyecto |
| Autenticación | `js/auth.js` | Registro, login y sesión |
| Datos | `js/store.js` | CRUD, agregaciones, import/export |
| Gráficas | `js/charts.js` | SVG sin dependencias, formato de moneda |
| UI | `js/app.js` | Render y eventos |
| Offline | `sw.js` | Precache de la app (las llamadas a Supabase siempre van a red) |

Sin framework ni build: HTML, CSS y JavaScript planos.

## Datos y seguridad

- Tablas: `user_settings`, `categories`, `transactions`, `debts`, `savings_goals`, `budgets`, `recurring_transactions`.
- **Row Level Security** en todas las tablas: cada usuario autenticado solo puede leer y modificar sus propias filas (`auth.uid() = user_id`); el rol anónimo no tiene acceso.
- Las recurrentes se generan en el servidor con la función `materialize_recurring(p_today)` (`SECURITY INVOKER`, sujeta a RLS), de forma atómica e idempotente: abrir la app en varias pestañas no duplica transacciones.
- La clave en `supabaseClient.js` es la clave pública del proyecto; es seguro exponerla porque el acceso lo restringe RLS.
- Migraciones SQL en `supabase/migrations/` (a partir de presupuestos y recurrentes; el esquema inicial se creó desde el panel de Supabase).

## Respaldo

**Ajustes → Exportar datos** descarga un JSON con todo. **Importar datos** lo vuelve a cargar: agrega los registros al contenido actual y omite los que ya existen, así que reimportar el mismo archivo no crea duplicados.
