const mysql = require('mysql2/promise');

async function main() {
  console.log('Connecting to MySQL (67.217.247.155) database mostrador12025...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
    database: 'mostrador12025'
  });

  try {
    // 1. Check how many clients in 'clientes' have non-empty address fields
    const [addrCount] = await connection.query(`
      SELECT COUNT(*) as cnt FROM clientes 
      WHERE (CALLE IS NOT NULL AND TRIM(CALLE) != '') 
         OR (COLONIA IS NOT NULL AND TRIM(COLONIA) != '') 
         OR (POBLACION IS NOT NULL AND TRIM(POBLACION) != '')
    `);
    console.log(`Clientes in 'clientes' table with some address data: ${addrCount[0].cnt}`);

    // 2. Check some rows in 'clientes' where CALLE is not empty
    const [addrRows] = await connection.query(`
      SELECT ID, NOMBRE, CALLE, COLONIA, POBLACION FROM clientes 
      WHERE (CALLE IS NOT NULL AND TRIM(CALLE) != '') 
         OR (COLONIA IS NOT NULL AND TRIM(COLONIA) != '')
      LIMIT 3
    `);
    console.log('Sample address rows in clientes:', JSON.stringify(addrRows, null, 2));

    // 3. Inspect 'listaclientes' table if it exists
    console.log('\nChecking table: listaclientes...');
    const [describeList] = await connection.query('DESCRIBE listaclientes');
    console.log('listaclientes columns:');
    describeList.forEach(c => console.log(`  - ${c.Field} (${c.Type})`));

    const [listCount] = await connection.query('SELECT COUNT(*) as cnt FROM listaclientes');
    console.log(`Total rows in listaclientes: ${listCount[0].cnt}`);

    const [listRows] = await connection.query('SELECT * FROM listaclientes LIMIT 3');
    console.log('Sample rows in listaclientes:', JSON.stringify(listRows, null, 2));

  } catch (err) {
    console.error('Error during database check:', err);
  } finally {
    await connection.end();
    console.log('Done.');
  }
}

main();
