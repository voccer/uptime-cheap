.PHONY: deploy

deploy:
	cd terraform && terraform init && terraform apply -var-file=main.tfvars

destroy:
	cd terraform && terraform destroy -var-file=main.tfvars