.PHONY: deploy

deploy:
	export AWS_PROFILE=pionero && cd terraform && terraform init && terraform apply -var-file=main.tfvars

destroy:
	export AWS_PROFILE=pionero && cd terraform && terraform destroy -var-file=main.tfvars