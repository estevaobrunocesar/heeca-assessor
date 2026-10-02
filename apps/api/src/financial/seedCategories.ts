import { prisma } from "../db/client";

// Taxonomia fornecida pelo usuário (categorias_despesas_assessor.csv).
const EXPENSE_CATEGORIES: Record<string, string[]> = {
  "Moradia": ["Aluguel", "Financiamento imobiliário", "Condomínio", "IPTU", "Energia elétrica", "Água e esgoto", "Gás", "Internet", "Telefone", "TV por assinatura", "Manutenção residencial", "Reformas", "Materiais de construção", "Móveis", "Eletrodomésticos", "Decoração", "Jardinagem", "Segurança residencial", "Dedetização", "Serviços domésticos", "Empregada doméstica", "Outros"],
  "Alimentação": ["Mercado", "Supermercado", "Feira", "Padaria", "Açougue", "Hortifruti", "Restaurante", "Delivery", "Lanches", "Fast food", "Café", "Doces e sobremesas", "Bebidas", "Marmita", "Alimentação no trabalho", "Alimentação escolar", "Outros"],
  "Transporte": ["Combustível", "Uber", "99", "Táxi", "Transporte público", "Ônibus", "Metrô", "Trem", "Estacionamento", "Pedágio", "Lavagem de veículo", "Manutenção do veículo", "Pneus", "Peças automotivas", "Seguro do veículo", "IPVA", "Licenciamento", "Multas", "Financiamento do veículo", "Aluguel de veículo", "Aplicativos de transporte", "Outros"],
  "Veículos": ["Compra de veículo", "Financiamento", "Combustível", "Manutenção preventiva", "Manutenção corretiva", "Pneus", "Bateria", "Óleo e filtros", "Seguro", "IPVA", "Licenciamento", "Multas", "Estacionamento", "Pedágio", "Lavagem", "Acessórios", "Documentação", "Outros"],
  "Saúde": ["Plano de saúde", "Consultas", "Exames", "Internação", "Hospital", "Dentista", "Ortodontia", "Farmácia", "Medicamentos", "Óculos e lentes", "Fisioterapia", "Psicólogo", "Terapia", "Nutricionista", "Academia", "Procedimentos estéticos", "Cirurgia", "Vacinas", "Outros"],
  "Educação": ["Escola", "Faculdade", "Universidade", "Pós-graduação", "Cursos", "Cursos online", "Idiomas", "Livros", "Material escolar", "Uniforme", "Matrícula", "Mensalidade", "Transporte escolar", "Atividades extracurriculares", "Creche", "Educação infantil", "Certificações", "Outros"],
  "Filhos": ["Fraldas", "Roupas", "Calçados", "Brinquedos", "Escola", "Creche", "Material escolar", "Medicamentos", "Consultas", "Alimentação", "Atividades", "Passeios", "Mesada", "Babá", "Festas", "Outros"],
  "Lazer": ["Cinema", "Teatro", "Shows", "Eventos", "Parques", "Passeios", "Viagens", "Hospedagem", "Turismo", "Jogos", "Games", "Hobbies", "Livros", "Música", "Streaming de entretenimento", "Restaurantes e lazer", "Clubes", "Esportes", "Outros"],
  "Viagens": ["Passagens aéreas", "Passagens rodoviárias", "Hospedagem", "Hotel", "Airbnb", "Aluguel de veículo", "Combustível", "Pedágios", "Estacionamento", "Alimentação", "Passeios", "Ingressos", "Seguro viagem", "Bagagem", "Câmbio", "Compras em viagem", "Outros"],
  "Beleza e Cuidados Pessoais": ["Cabeleireiro", "Barbearia", "Manicure", "Pedicure", "Depilação", "Estética", "Massagem", "Cosméticos", "Perfumes", "Maquiagem", "Skincare", "Produtos para cabelo", "Produtos de higiene pessoal", "Roupas", "Calçados", "Acessórios", "Joias e bijuterias", "Outros"],
  "Pets": ["Ração", "Pet shop", "Veterinário", "Medicamentos", "Vacinas", "Banho e tosa", "Brinquedos", "Acessórios", "Hotel para pets", "Adestramento", "Cirurgias", "Exames", "Outros"],
  "Assinaturas": ["Netflix", "Disney+", "Amazon Prime", "Max", "Globoplay", "Spotify", "YouTube Premium", "Apple", "Google", "Microsoft", "Software", "Aplicativos", "Armazenamento em nuvem", "Academia", "Clube", "Revistas", "Jornais", "Outras assinaturas"],
  "Comunicação": ["Celular", "Plano móvel", "Internet", "Telefone fixo", "TV por assinatura", "Correios", "Mensageria", "Outros"],
  "Tecnologia e Eletrônicos": ["Celular", "Computador", "Notebook", "Tablet", "Monitor", "Impressora", "Periféricos", "Acessórios", "Software", "Aplicativos", "Games", "Console", "Peças", "Manutenção", "Armazenamento em nuvem", "Serviços digitais", "Outros"],
  "Roupas e Acessórios": ["Roupas", "Calçados", "Roupas íntimas", "Uniformes", "Bolsas", "Mochilas", "Relógios", "Óculos", "Joias", "Bijuterias", "Acessórios", "Outros"],
  "Compras": ["Eletrônicos", "Móveis", "Eletrodomésticos", "Casa", "Roupas", "Calçados", "Presentes", "Brinquedos", "Marketplace", "Compras online", "Compras presenciais", "Importados", "Outros"],
  "Serviços": ["Eletricista", "Encanador", "Pedreiro", "Pintor", "Marceneiro", "Chaveiro", "Técnico", "Manutenção", "Limpeza", "Lavanderia", "Costureira", "Fotografia", "Gráfica", "Despachante", "Serviços jurídicos", "Serviços contábeis", "Outros"],
  "Financeiro": ["Tarifa bancária", "Anuidade de cartão", "Juros", "Multas", "IOF", "Taxas", "Saque", "Cheque especial", "Empréstimo", "Financiamento", "Parcelamento de dívida", "Renegociação", "Câmbio", "Outros"],
  "Cartão de Crédito": ["Pagamento de fatura", "Anuidade", "Juros de cartão", "Encargos", "Rotativo", "Parcelamento de fatura", "Outros"],
  "Impostos e Taxas": ["IRPF", "IPTU", "IPVA", "ITBI", "ISS", "ICMS", "Taxas públicas", "Multas", "Licenciamento", "Taxas cartoriais", "Taxas de registro", "Outros"],
  "Seguros": ["Seguro de vida", "Seguro residencial", "Seguro automóvel", "Seguro saúde", "Seguro viagem", "Seguro celular", "Seguro empresarial", "Outros"],
  "Investimentos e Patrimônio": ["Aporte em investimento", "Aplicação", "Previdência privada", "Ações", "ETFs", "Fundos", "Tesouro Direto", "CDB", "LCI", "LCA", "Criptomoedas", "Poupança", "Reserva de emergência", "Compra de imóvel", "Compra de veículo", "Outros"],
  "Doações e Solidariedade": ["Doação", "Igreja", "Instituição social", "Campanha", "Presente solidário", "Outros"],
  "Presentes": ["Aniversário", "Casamento", "Natal", "Dia das mães", "Dia dos pais", "Dia dos namorados", "Crianças", "Família", "Amigos", "Outros"],
  "Trabalho e Profissional": ["Alimentação no trabalho", "Transporte profissional", "Cursos profissionais", "Certificações", "Equipamentos", "Software profissional", "Material de escritório", "Coworking", "Eventos", "Networking", "Uniforme", "EPI", "Mensalidades profissionais", "Outros"],
  "Casa e Utilidades": ["Produtos de limpeza", "Utensílios de cozinha", "Utensílios domésticos", "Roupa de cama", "Roupa de banho", "Organização", "Ferramentas", "Decoração", "Pequenos reparos", "Outros"],
  "Esportes": ["Academia", "Personal trainer", "Futebol", "Corrida", "Ciclismo", "Natação", "Artes marciais", "Equipamentos", "Roupas esportivas", "Calçados esportivos", "Mensalidade", "Competições", "Outros"],
  "Bancos e Transferências": ["Transferência para outra conta", "Transferência entre contas próprias", "PIX enviado", "PIX recebido", "Depósito", "Saque", "Resgate de aplicação", "Aplicação", "Pagamento de fatura", "Outros"],
  "Dívidas e Obrigações": ["Empréstimo", "Financiamento", "Parcelamento", "Cartão de crédito", "Acordo de dívida", "Empréstimo pessoal", "Consignado", "Financiamento imobiliário", "Financiamento de veículo", "Outros"],
  "Eventos e Festas": ["Festa de aniversário", "Casamento", "Formatura", "Decoração", "Buffet", "Bebidas", "Convites", "Fotografia", "Música", "Salão", "Presentes", "Outros"],
  "Outros": ["Despesa não categorizada", "Despesa extraordinária", "Outros"],
};

const INCOME_CATEGORIES = [
  "Salário",
  "Comissão",
  "Freelance",
  "Prestação de serviços",
  "Venda",
  "Rendimentos",
  "Investimentos",
  "Reembolso",
  "Transferência recebida",
  "Outros",
];

// Prisma's compound-unique "where" doesn't accept a literal null for a
// nullable key column, so root categories (parentId IS NULL) can't use
// upsert's unique-where shortcut — fall back to findFirst + create.
async function upsertRootCategory(name: string, type: "EXPENSE" | "INCOME", workspaceId: string) {
  const existing = await prisma.category.findFirst({ where: { name, parentId: null, type, workspaceId } });
  if (existing) return existing;
  return prisma.category.create({ data: { name, type, workspaceId } });
}

export async function seedDefaultCategories(workspaceId: string) {
  for (const [parentName, children] of Object.entries(EXPENSE_CATEGORIES)) {
    const parent = await upsertRootCategory(parentName, "EXPENSE", workspaceId);
    for (const childName of children) {
      await prisma.category.upsert({
        where: { workspaceId_name_parentId: { workspaceId, name: childName, parentId: parent.id } },
        update: {},
        create: { name: childName, type: "EXPENSE", parentId: parent.id, workspaceId },
      });
    }
  }

  for (const name of INCOME_CATEGORIES) {
    await upsertRootCategory(name, "INCOME", workspaceId);
  }
}
