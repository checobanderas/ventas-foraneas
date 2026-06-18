import mysql from 'mysql2/promise';

async function main() {
  console.log('Connecting to MySQL (67.217.247.155) database: ventas_moviles...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
    database: 'ventas_moviles'
  });

  try {
    console.log('Describing table prods...');
    const [columns] = await connection.query('DESCRIBE prods');
    console.log('Table columns:', columns.map(c => `${c.Field} (${c.Type})`));

    console.log('\nFetching first 5 products as sample:');
    const [rows] = await connection.query('SELECT * FROM prods LIMIT 5');
    console.log(JSON.stringify(rows, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.end();
    console.log('Connection closed.');
  }
}

main();
