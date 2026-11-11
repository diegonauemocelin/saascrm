# Trier pela VPN da farmácia

Guia para o dono da plataforma. Serve para quando a farmácia não quer (ou não pode) deixar o servidor da Trier
aberto na internet e oferece acesso pela VPN dela. Nesse caso a VPS do SaaS entra na VPN **como cliente** e o CRM
chama o servidor da Trier pelo IP privado (ex.: `10.8.0.20:4647`).

O CRM continua bloqueando endereços de rede privada por padrão. Um IP privado só funciona depois que a empresa da
plataforma libera **aquele IP e aquela porta** para aquela empresa (nunca uma faixa inteira). Loopback (`127.x`),
link-local (`169.254.x`, inclusive os metadados de nuvem `169.254.169.254`) e endereços reservados nunca são
aceitos, mesmo com liberação.

Nada disso é feito pelo `deploy.sh`: a VPN é configurada à mão, uma vez por farmácia.

## 1. O que pedir à farmácia (ou ao técnico de TI dela)

- Um acesso de VPN **só para a VPS** (um usuário/certificado próprio, que possa ser revogado sem afetar ninguém).
- O IP do servidor da Trier dentro da VPN e a porta (padrão `4647`).
- Que a VPN **não** empurre rota padrão (`0.0.0.0/0`) nem DNS para o cliente. A VPS só precisa da rota até o IP
  do servidor da Trier.
- O token da Trier para integração (fornecido pela Trier, `parcerias@grupotrier.com.br`).

## 2. Colocar a VPS na VPN como cliente

Os comandos abaixo são exemplos genéricos; siga o tipo de VPN que a farmácia usa. Em todos os casos:

- **Só a rota para o IP do servidor Trier** (um `/32`). Sem rota padrão: o tráfego da VPS continua saindo pela
  internet normal.
- **Nada da VPS exposto para a rede da farmácia**: a VPS não aceita conexões vindas da VPN (firewall abaixo).
- Uma VPN por farmácia; se houver mais de uma, use interfaces diferentes (`wg-farmacia1`, `tun-farmacia2`...).

### WireGuard

```bash
sudo apt install wireguard
sudo nano /etc/wireguard/wg-farmacia1.conf
```

```ini
[Interface]
PrivateKey = <chave privada da VPS>
Address = <IP da VPS na VPN, ex.: 10.8.0.50/32>
# Sem DNS = ... (não usar o DNS da farmácia)

[Peer]
PublicKey = <chave pública do servidor de VPN da farmácia>
Endpoint = <ip-ou-ddns-da-farmacia>:51820
# Só o servidor da Trier, nada de 0.0.0.0/0:
AllowedIPs = 10.8.0.20/32
PersistentKeepalive = 25
```

```bash
sudo systemctl enable --now wg-quick@wg-farmacia1
sudo wg show
```

### OpenVPN

Use o arquivo `.ovpn` que a farmácia mandar e acrescente no fim:

```
# Ignora rotas e DNS empurrados pelo servidor e cria só a rota do servidor da Trier.
route-nopull
route 10.8.0.20 255.255.255.255
pull-filter ignore "dhcp-option"
```

```bash
sudo apt install openvpn
sudo cp farmacia1.ovpn /etc/openvpn/client/farmacia1.conf
sudo systemctl enable --now openvpn-client@farmacia1
ip route | grep 10.8.0.20
```

### Firewall (as duas VPNs)

Bloqueie tudo o que chega pela interface da VPN; só as respostas das conexões que a VPS abriu passam:

```bash
# Troque wg-farmacia1 pela interface da VPN (tun0, por exemplo, no OpenVPN).
sudo iptables -A INPUT -i wg-farmacia1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -i wg-farmacia1 -j DROP
# O CRM roda em contêineres Docker: a saída deles passa pelo FORWARD (a cadeia DOCKER-USER vem antes das regras do
# Docker). Só a conexão até o servidor da Trier e as respostas dela:
sudo iptables -I DOCKER-USER -i wg-farmacia1 -j DROP
sudo iptables -I DOCKER-USER -i wg-farmacia1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -I DOCKER-USER -o wg-farmacia1 -j DROP
sudo iptables -I DOCKER-USER -o wg-farmacia1 -d 10.8.0.20 -p tcp --dport 4647 -j ACCEPT
# Saída da própria VPS pela VPN (o teste com curl) só para o servidor da Trier, na porta dele:
sudo iptables -A OUTPUT -o wg-farmacia1 -d 10.8.0.20 -p tcp --dport 4647 -j ACCEPT
sudo iptables -A OUTPUT -o wg-farmacia1 -j DROP
# Guardar as regras (Debian/Ubuntu):
sudo apt install iptables-persistent && sudo netfilter-persistent save
```

Se a VPS usa `ufw`, faça o equivalente com `ufw deny in on wg-farmacia1` e
`ufw allow out on wg-farmacia1 to 10.8.0.20 port 4647 proto tcp` (e `ufw deny out on wg-farmacia1`).

**Docker:** os contêineres do CRM saem pela rede da VPS (o Docker já faz o NAT para qualquer interface de saída),
então a rota criada pela VPN vale para eles; não é preciso mexer no `docker-compose.yml`. As regras `-I` entram no
topo da `DOCKER-USER` na ordem inversa da digitação: confira com `sudo iptables -L DOCKER-USER -n --line-numbers`
que os dois ACCEPT ficam acima dos DROP. Depois de reiniciar o Docker, rode `sudo netfilter-persistent reload`.

## 3. Testar

Na VPS, com o token da Trier numa variável (não deixe o token no histórico de comandos de outra pessoa):

```bash
read -s TRIER_TOKEN
curl -sS -m 15 -H "Authorization: Bearer $TRIER_TOKEN" \
  "http://10.8.0.20:4647/sgfpod1/rest/integracao/produto/obter-todos-v1?primeiroRegistro=0&quantidadeRegistros=1"
unset TRIER_TOKEN
```

- Volta uma lista JSON com um produto: a VPN e o token estão certos.
- `401`: token errado. `404`: caminho errado (o padrão é `/sgfpod1`). Sem resposta: rota da VPN, firewall da
  farmácia ou serviço da Trier parado.

## 4. Liberar o IP e a porta na plataforma

1. Na empresa, em **Integração Trier › Configuração**, a farmácia (ou você, por ela) informa o endereço
   `http://10.8.0.20:4647` e o token, e salva. A tela mostra "Acesso pela VPN: aguardando liberação da plataforma".
2. No painel da plataforma (`crm.sgmulticonecta.com.br`), com a permissão Plataforma › Editar, abra
   **Integração Trier › Acesso pela VPN (plataforma)**. A empresa aparece com o endereço pedido.
3. Confira que o IP e a porta são os do teste acima e clique em **Liberar este IP:porta**. Fica registrado na
   auditoria (quem liberou e quando).
4. Na empresa, clique em **Testar conexão** e depois em **Copiar agora**.

Se a empresa mudar o endereço (outro IP ou outra porta), a liberação deixa de valer e a tela volta a mostrar
"aguardando liberação". Para cortar o acesso: **Retirar liberação** na plataforma e desligue a VPN na VPS
(`sudo systemctl disable --now wg-quick@wg-farmacia1` ou `openvpn-client@farmacia1`).
