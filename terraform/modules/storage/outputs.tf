output "sites_table_name" { value = aws_dynamodb_table.sites.name }
output "sites_table_arn"  { value = aws_dynamodb_table.sites.arn }
output "beats_table_name" { value = aws_dynamodb_table.beats.name }
output "beats_table_arn"  { value = aws_dynamodb_table.beats.arn }
