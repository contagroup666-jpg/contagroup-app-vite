/**
 * Ejecuta `tarea` para cada elemento de `items`, procesando como máximo
 * `tamanoLote` en paralelo a la vez, en vez de todos a la vez (que puede
 * saturar al servicio destino) o uno por uno (que es innecesariamente lento
 * cuando el servicio sí soporta algo de paralelismo).
 *
 * El orden de los resultados coincide con el orden de `items`.
 */
export async function ejecutarEnLotes<T, R>(
  items: T[],
  tamanoLote: number,
  tarea: (item: T, indice: number) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = new Array(items.length)
  for (let inicio = 0; inicio < items.length; inicio += tamanoLote) {
    const lote = items.slice(inicio, inicio + tamanoLote)
    const resultadosLote = await Promise.all(
      lote.map((item, i) => tarea(item, inicio + i))
    )
    resultadosLote.forEach((r, i) => {
      resultados[inicio + i] = r
    })
  }
  return resultados
}
