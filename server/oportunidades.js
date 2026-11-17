// Clientes antigos devem recarregar; pesquisas não podem voltar a percorrer a fonte externa.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 return res.status(410).json({error:'A pesquisa foi atualizada. Recarregue a página para usar o catálogo indexado.'})
}
