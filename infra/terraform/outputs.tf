output "cluster_name" { value = aws_eks_cluster.main.name }
output "cluster_endpoint" { value = aws_eks_cluster.main.endpoint; sensitive = true }
output "ecr_repository_url" { value = aws_ecr_repository.app.repository_url }
