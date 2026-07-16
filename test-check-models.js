async function main() {
  try {
    const res = await fetch('http://127.0.0.1:31415/v1/models');
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}
main();