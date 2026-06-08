import pathlib

path = pathlib.Path(r'E:\大模型\向量数据库可视化\backend\app\services\chroma_service.py')
content = path.read_text('utf-8')

# Insert clear_collection between add_to_collection and _safe_collection_name
marker = '    def _safe_collection_name(display_name: str) -> str:'

clear_method = '''    def clear_collection(self, collection_name: str) -> int:
        """Delete all records from a collection. Returns count of deleted records."""
        client = self._get_client()
        if client is None:
            return -1
        try:
            collection = client.get_collection(collection_name)
            if collection is None:
                return 0
            count = collection.count()
            if count > 0:
                all_ids = collection.get(include=[])["ids"]
                if all_ids:
                    collection.delete(ids=all_ids)
            return count
        except Exception:
            return -1

'''

if marker in content:
    content = content.replace(marker, clear_method + marker)
    path.write_text(content, 'utf-8')
    print('clear_collection added')
else:
    print('Marker not found')